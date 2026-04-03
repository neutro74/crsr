#!/usr/bin/env node
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadShellConfig } from "./config/config.js";
import { renderCommandResult } from "./output/renderers.js";
import { CursorAgentAdapter } from "./runtime/cursorAgent.js";
import { allCommands } from "./runtime/commandCatalog.js";
import { ShellRouter } from "./shell/router.js";
import { runApp } from "./shell/app.js";
import { createSessionStore } from "./session/sessionStore.js";

interface CliOptions {
  initialCommand?: string;
  oneShot: boolean;
  workspace?: string;
}

type CliParseResult =
  | CliOptions
  | "help"
  | "version"
  | { error: string };

const FALLBACK_VERSION = "0.2.0";

function getCliVersion(): string {
  try {
    const entryDir = path.dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = path.resolve(entryDir, "..", "package.json");
    const rawPackageJson = readFileSync(packageJsonPath, "utf8");
    const parsedPackageJson = JSON.parse(rawPackageJson) as {
      version?: unknown;
    };
    if (
      typeof parsedPackageJson.version === "string" &&
      parsedPackageJson.version.trim().length > 0
    ) {
      return parsedPackageJson.version;
    }
  } catch {
    // Fall back to the version bundled at build time when package.json is unavailable.
  }

  return FALLBACK_VERSION;
}

const CLI_VERSION = getCliVersion();
const CLI_FLAGS = new Set(["--help", "-h", "--version", "-v", "--once", "--workspace"]);

function renderHelp(): void {
  console.log(`crsr - terminal wrapper for cursor-agent

Usage:
  crsr [options] [initial command or prompt...]

Options:
  --workspace <path>  Set the workspace for delegated commands
  --once              Run the initial command once and exit (headless)
  -h, --help          Show this help message
  -v, --version       Show the version

Interactive commands start with /. Plain text sends a prompt.
Run 'crsr --once /help' to see all interactive commands.
`);
}

function renderVersion(): void {
  console.log(`crsr ${CLI_VERSION}`);
}

function parseCliArguments(
  argv: string[],
): CliParseResult {
  const options: CliOptions = { oneShot: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }
    if (token === "--help" || token === "-h") return "help";
    if (token === "--version" || token === "-v") return "version";

    if (token === "--once") {
      options.oneShot = true;
      continue;
    }

    if (token.startsWith("--workspace=")) {
      const workspace = token.slice("--workspace=".length);
      if (workspace.length === 0) {
        return { error: "--workspace requires a path." };
      }
      options.workspace = workspace;
      continue;
    }

    if (token === "--workspace") {
      const workspace = argv[index + 1];
      if (!workspace || CLI_FLAGS.has(workspace)) {
        return { error: "--workspace requires a path." };
      }
      options.workspace = workspace;
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
  }
}

const cliOptions = parseCliArguments(process.argv.slice(2));
if (cliOptions === "help") {
  renderHelp();
  process.exit(0);
}

if (cliOptions === "version") {
  renderVersion();
  process.exit(0);
}

if ("error" in cliOptions) {
  console.error(cliOptions.error);
  process.exit(1);
}

const config = loadShellConfig();
const initialWorkspace =
  cliOptions.workspace ?? config.workspace ?? os.homedir();
const store = createSessionStore(config.paths, initialWorkspace);
if (initialWorkspace) {
  store.setActiveWorkspace(initialWorkspace);
}

if (config.apiKey) {
  store.setApiKey(config.apiKey);
}
if (config.approveMcps) {
  store.setApproveMcps(true);
}
if (config.sandbox) {
  store.setSandbox(config.sandbox);
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
