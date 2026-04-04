#!/usr/bin/env node
import { main } from "./cli.js";

function reportFatalError(error: unknown): void {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
}

void main().then(
  (exitCode) => {
    process.exit(exitCode);
  },
  (error: unknown) => {
    reportFatalError(error);
    process.exit(1);
  },
);
