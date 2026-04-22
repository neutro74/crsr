#!/usr/bin/env node
import { runCli } from "./cli.js";

void runCli().then(
  (exitCode) => {
    process.exit(exitCode);
  },
  (error: unknown) => {
    const message =
      error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  },
);
