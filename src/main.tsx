#!/usr/bin/env node
import { loadShellConfig } from "./config/config.js";
import { renderCommandResult } from "./output/renderers.js";
import { CursorAgentAdapter } from "./runtime/cursorAgent.js";
import { allCommands } from "./runtime/commandCatalog.js";
import { ShellRouter } from "./shell/router.js";
import { runApp } from "./shell/app.js";
import { createSessionStore } from "./session/sessionStore.js";
import { runSelfUpdate } from "./update.js";
import { APP_NAME, APP_VERSION } from "./version.js";

interface CliOptions {
  initialCommand?: string;
  oneShot: boolean;
  update: boolean;
  workspace?: string;
}

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

Interactive commands start with /. Plain text sends a prompt.
Run 'crsr --once /help' to see all interactive commands.
`);
}

function renderVersion(): void {
  console.log(`${APP_NAME} ${APP_VERSION}`);
}

function parseCliArguments(
  argv: string[],
): CliOptions | "help" | "version" {
  const options: CliOptions = { oneShot: false, update: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") return "help";
    if (token === "--version" || token === "-v") return "version";

    if (token === "--once") {
      options.oneShot = true;
      continue;
    }

    if (token === "--update") {
      options.update = true;
      continue;
    }

    if (token.startsWith("--workspace=")) {
      const workspaceValue = token.slice("--workspace=".length).trim();
      if (workspaceValue.length === 0) {
        throw new Error("--workspace requires a path.");
      }
      options.workspace = workspaceValue;
      continue;
    }

    if (token === "--workspace") {
      const workspaceValue = argv[index + 1]?.trim();
      if (!workspaceValue) {
        throw new Error("--workspace requires a path.");
      }
      options.workspace = workspaceValue;
      index += 1;
      continue;
    }

    options.initialCommand = argv.slice(index).join(" ");
    break;
  }

  return options;
}

function normalizeInitialCommand(
  initialCommand: string | undefined,
): string | undefined {
  if (!initialCommand) return undefined;
  const trimmedCommand = initialCommand.trim();
  if (trimmedCommand.length === 0) return undefined;
  if (trimmedCommand.startsWith("/")) return trimmedCommand;

  const firstToken = trimmedCommand.split(/\s+/u)[0];
  const knownNames = new Set([
    ...allCommands.map((command) => command.name.split(" ")[0]),
    "mcp",
  ]);

  return knownNames.has(firstToken) ? `/${trimmedCommand}` : trimmedCommand;
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
      console.error(`Cannot run terminal program "${outcome.program}" in headless mode.`);
      return 1;
  }
}

let cliOptions: CliOptions | "help" | "version";
try {
  cliOptions = parseCliArguments(process.argv.slice(2));
} catch (error) {
  const message =
    error instanceof Error ? error.message : "Unable to parse CLI arguments.";
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

if (cliOptions === "help") {
  renderHelp();
  process.exit(0);
}

if (cliOptions === "version") {
  renderVersion();
  process.exit(0);
}

if (cliOptions.update) {
  void runSelfUpdate()
    .then(() => {
      process.exit(0);
    })
    .catch((error: unknown) => {
      const message =
        error instanceof Error ? error.stack ?? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exit(1);
    });
} else {
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

  void (async () => {
    if (cliOptions.oneShot) {
      if (!normalizedInitialCommand) {
        console.error("--once requires an initial command or prompt.");
        process.exit(1);
      }

      const exitCode = await runOneShotCommand(
        normalizedInitialCommand,
        adapter,
        store,
        config,
      );
      process.exit(exitCode);
    }

    await runApp({
      config,
      adapter,
      store,
      initialCommand: normalizedInitialCommand,
      oneShot: cliOptions.oneShot,
    });
  })().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
