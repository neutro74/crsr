#!/usr/bin/env node
import {
  normalizeInitialCommand,
  parseCliArguments,
  renderHelp,
  renderVersion,
} from "./cli.js";
import { loadShellConfig } from "./config/config.js";
import { renderCommandResult } from "./output/renderers.js";
import { CursorAgentAdapter } from "./runtime/cursorAgent.js";
import { ShellRouter } from "./shell/router.js";
import { runApp } from "./shell/app.js";
import { createSessionStore } from "./session/sessionStore.js";
import { runSelfUpdate } from "./update.js";

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

const cliParseResult = parseCliArguments(process.argv.slice(2));
if (cliParseResult.kind === "help") {
  console.log(renderHelp());
  process.exit(0);
}

if (cliParseResult.kind === "version") {
  console.log(renderVersion());
  process.exit(0);
}

if (cliParseResult.kind === "error") {
  process.stderr.write(`${cliParseResult.message}\n`);
  process.exit(1);
}

const cliOptions = cliParseResult.options;
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
