#!/usr/bin/env node
import { normalizeInitialCommand, parseCliArguments } from "./cli.js";
import { loadShellConfig } from "./config/config.js";
import { renderCommandResult } from "./output/renderers.js";
import { CursorAgentAdapter } from "./runtime/cursorAgent.js";
import { ShellRouter } from "./shell/router.js";
import { runApp } from "./shell/app.js";
import { createSessionStore } from "./session/sessionStore.js";
import { runSelfUpdate } from "./update.js";
import { APP_NAME, APP_VERSION } from "./version.js";

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
    case "open-settings":
    case "tab-action":
      return 0;
    case "terminal":
      console.error(`Cannot run terminal program "${outcome.program}" in headless mode.`);
      return 1;
  }
}

const cliOptions = parseCliArguments(process.argv.slice(2));
if (cliOptions.kind === "help") {
  renderHelp();
  process.exit(0);
}

if (cliOptions.kind === "version") {
  renderVersion();
  process.exit(0);
}

if (cliOptions.kind === "error") {
  process.stderr.write(`${cliOptions.message}\n`);
  process.exit(1);
}

if (cliOptions.options.update) {
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
  const initialWorkspace = cliOptions.options.workspace ?? config.workspace;
  const store = createSessionStore(config.paths, initialWorkspace, {
    model: config.defaultModel,
    mode: config.defaultMode,
    forceMode: config.forceMode,
    sandbox: config.sandbox,
    approveMcps: config.approveMcps,
  });

  if (cliOptions.options.workspace) {
    store.setActiveWorkspace(cliOptions.options.workspace);
  }

  if (config.apiKey) {
    store.setApiKey(config.apiKey);
  }

  const adapter = new CursorAgentAdapter(config);
  const normalizedInitialCommand = normalizeInitialCommand(
    cliOptions.options.initialCommand,
  );

  void (async () => {
    if (cliOptions.options.oneShot) {
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
      oneShot: cliOptions.options.oneShot,
    });
  })().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
