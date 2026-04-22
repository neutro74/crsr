import { loadShellConfig } from "./config/config.js";
import { renderCommandResult } from "./output/renderers.js";
import { CursorAgentAdapter } from "./runtime/cursorAgent.js";
import { allCommands } from "./runtime/commandCatalog.js";
import { ShellRouter } from "./shell/router.js";
import { runApp } from "./shell/app.js";
import { createSessionStore } from "./session/sessionStore.js";
import { runSelfUpdate } from "./update.js";
import { APP_NAME, APP_VERSION } from "./version.js";

export interface CliOptions {
  initialCommand?: string;
  oneShot: boolean;
  update: boolean;
  workspace?: string;
}

export type CliParseResult =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string }
  | { kind: "ok"; options: CliOptions };

function renderHelp(): void {
  console.log(`crsr - terminal wrapper for cursor-agent

Usage:
  crsr [options] [initial command or prompt...]

Options:
  --workspace <path>  Set the workspace for delegated commands
  --once              Run the initial command once and exit (headless)
  --update            Download and replace this binary from GitHub releases
  -h, --help          Show this help message
  -v, --version       Show the version
  --                  Stop parsing options and treat the rest as the prompt

Interactive commands start with /. Plain text sends a prompt.
Run 'crsr --once /help' to see all interactive commands.
`);
}

function renderVersion(): void {
  console.log(`${APP_NAME} ${APP_VERSION}`);
}

export function parseCliArguments(argv: string[]): CliParseResult {
  const options: CliOptions = { oneShot: false, update: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    if (token === "--help" || token === "-h") {
      return { kind: "help" };
    }

    if (token === "--version" || token === "-v") {
      return { kind: "version" };
    }

    if (token === "--once") {
      options.oneShot = true;
      continue;
    }

    if (token === "--update") {
      options.update = true;
      continue;
    }

    if (token === "--workspace") {
      const workspace = argv[index + 1];
      if (!workspace || workspace === "--") {
        return {
          kind: "error",
          message: "--workspace requires a path.",
        };
      }
      options.workspace = workspace;
      index += 1;
      continue;
    }

    if (token === "--") {
      const remaining = argv.slice(index + 1);
      options.initialCommand =
        remaining.length > 0 ? remaining.join(" ") : undefined;
      return { kind: "ok", options };
    }

    if (token.startsWith("-")) {
      return {
        kind: "error",
        message: `Unknown option "${token}". Run crsr --help to see supported flags.`,
      };
    }

    options.initialCommand = argv.slice(index).join(" ");
    return { kind: "ok", options };
  }

  return { kind: "ok", options };
}

export function normalizeInitialCommand(
  initialCommand: string | undefined,
): string | undefined {
  if (!initialCommand) return undefined;
  if (initialCommand.startsWith("/")) return initialCommand;

  const firstToken = initialCommand.trim().split(/\s+/u)[0];
  const knownNames = new Set([
    ...allCommands.map((command) => command.name.split(" ")[0]),
    "mcp",
  ]);

  return knownNames.has(firstToken) ? `/${initialCommand}` : initialCommand;
}

async function runOneShotCommand(
  command: string,
  adapter: CursorAgentAdapter,
  store: ReturnType<typeof createSessionStore>,
  config: ReturnType<typeof loadShellConfig>,
): Promise<number> {
  const router = new ShellRouter(adapter, store, config.commandPassthrough);
  const outcome = await router.routeInput(command);

  switch (outcome.kind) {
    case "noop":
    case "clear":
    case "exit":
      return 0;
    case "message":
      console.log(`${outcome.title}\n${outcome.body}`);
      return 0;
    case "self-update":
      await runSelfUpdate();
      return 0;
    case "run": {
      let wroteStdout = false;
      const result = await outcome.execute((event) => {
        switch (event.type) {
          case "stdout":
          case "partial":
            wroteStdout = true;
            process.stdout.write(event.text);
            break;
          case "stderr":
            process.stderr.write(event.text);
            break;
          case "thinking":
            process.stderr.write(`[thinking] ${event.text}`);
            break;
          case "subagent":
            process.stderr.write(
              event.phase === "started"
                ? `\n[subagent] ${event.description}\n`
                : event.summary
                  ? `\n[subagent done] ${event.description}\n${event.summary}\n`
                  : `\n[subagent done] ${event.description}\n`,
            );
            break;
          case "status":
          case "thinking-complete":
          case "json":
            break;
        }
      });

      const summary = renderCommandResult(result);
      if (summary.length > 0) {
        const target = result.exitCode === 0 ? process.stdout : process.stderr;
        if (wroteStdout) {
          target.write("\n");
        }
        target.write(`${summary}\n`);
      }

      return result.exitCode;
    }
    case "open-settings":
    case "tab-action":
      return 0;
    case "terminal":
      console.error(
        `Cannot run terminal program "${outcome.program}" in headless mode.`,
      );
      return 1;
  }
}

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  const parsed = parseCliArguments(argv);
  if (parsed.kind === "help") {
    renderHelp();
    return 0;
  }

  if (parsed.kind === "version") {
    renderVersion();
    return 0;
  }

  if (parsed.kind === "error") {
    process.stderr.write(`${parsed.message}\n`);
    return 1;
  }

  const cliOptions = parsed.options;

  if (cliOptions.update) {
    await runSelfUpdate();
    return 0;
  }

  const config = loadShellConfig();
  const initialWorkspace = cliOptions.workspace ?? config.workspace;
  const store = createSessionStore(config.paths, initialWorkspace, {
    model: config.defaultModel,
    mode: config.defaultMode,
    forceMode: config.forceMode,
    sandbox: config.sandbox,
    approveMcps: config.approveMcps,
  });

  if (cliOptions.workspace) {
    store.setActiveWorkspace(cliOptions.workspace);
  }

  if (config.apiKey) {
    store.setApiKey(config.apiKey);
  }

  const adapter = new CursorAgentAdapter(config);
  const normalizedInitialCommand = normalizeInitialCommand(
    cliOptions.initialCommand,
  );

  if (cliOptions.oneShot) {
    if (!normalizedInitialCommand) {
      process.stderr.write("--once requires an initial command or prompt.\n");
      return 1;
    }

    return runOneShotCommand(
      normalizedInitialCommand,
      adapter,
      store,
      config,
    );
  }

  await runApp({
    config,
    adapter,
    store,
    initialCommand: normalizedInitialCommand,
    oneShot: cliOptions.oneShot,
  });

  return 0;
}
