#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  | CliOptions
  | "help"
  | "version"
  | { error: string };

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

Use -- to stop option parsing before an initial command that starts with -.
Interactive commands start with /. Plain text sends a prompt.
Run 'crsr --once /help' to see all interactive commands.
`);
}

function renderVersion(): void {
  console.log(`${APP_NAME} ${APP_VERSION}`);
}

export function parseCliArguments(
  argv: string[],
): CliParseResult {
  const options: CliOptions = { oneShot: false, update: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    if (token === "--") {
      options.initialCommand = argv.slice(index + 1).join(" ");
      break;
    }

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

    if (token === "--workspace") {
      const workspace = argv[index + 1];
      if (!workspace || workspace === "--") {
        return { error: "--workspace requires a path." };
      }
      options.workspace = workspace;
      index += 1;
      continue;
    }

    if (token.startsWith("--workspace=")) {
      const workspace = token.slice("--workspace=".length).trim();
      if (workspace.length === 0) {
        return { error: "--workspace requires a path." };
      }
      options.workspace = workspace;
      continue;
    }

    if (token.startsWith("-")) {
      return {
        error: `Unknown option "${token}". Run "crsr --help" to see supported flags.`,
      };
    }

    options.initialCommand = argv.slice(index).join(" ");
    break;
  }

  return options;
}

export function normalizeInitialCommand(
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

  return knownNames.has(firstToken) ? `/${trimmedCommand}` : initialCommand;
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
          case "status":
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
    case "tab-action":
      return 0;
    case "terminal":
      console.error(`Cannot run terminal program "${outcome.program}" in headless mode.`);
      return 1;
  }
}

function reportFatalError(error: unknown): void {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
}

function isEntrypoint(metaUrl: string): boolean {
  const entryPath = process.argv[1];
  if (!entryPath) {
    return false;
  }

  try {
    return fileURLToPath(metaUrl) === path.resolve(entryPath);
  } catch {
    return false;
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const cliOptions = parseCliArguments(argv);
  if (cliOptions === "help") {
    renderHelp();
    return 0;
  }

  if (cliOptions === "version") {
    renderVersion();
    return 0;
  }

  if ("error" in cliOptions) {
    process.stderr.write(`${cliOptions.error}\n`);
    return 1;
  }

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

    return runOneShotCommand(normalizedInitialCommand, adapter, store, config);
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

if (isEntrypoint(import.meta.url)) {
  void main().then(
    (exitCode) => {
      process.exit(exitCode);
    },
    (error: unknown) => {
      reportFatalError(error);
      process.exit(1);
    },
  );
}
