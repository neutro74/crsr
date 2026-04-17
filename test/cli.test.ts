import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeInitialCommand,
  parseCliArguments,
} from "../src/cli.js";

test("parseCliArguments validates a missing workspace value", () => {
  const result = parseCliArguments(["--workspace"]);
  assert.deepEqual(result, {
    kind: "error",
    message:
      "--workspace requires a path. Use --workspace <path> or --workspace=<path>.",
  });
});

test("parseCliArguments supports -- passthrough for dash-prefixed prompts", () => {
  const result = parseCliArguments([
    "--workspace",
    "/tmp/project",
    "--once",
    "--",
    "--help",
  ]);

  assert.equal(result.kind, "run");
  assert.deepEqual(result.options, {
    workspace: "/tmp/project",
    oneShot: true,
    update: false,
    initialCommand: "--help",
  });
});

test("parseCliArguments rejects unknown options before the prompt", () => {
  const result = parseCliArguments(["--bogus"]);
  assert.deepEqual(result, {
    kind: "error",
    message: 'Unknown option "--bogus". Use -- to pass a prompt that starts with -.',
  });
});

test("normalizeInitialCommand prefixes known slash commands", () => {
  assert.equal(normalizeInitialCommand("status"), "/status");
  assert.equal(
    normalizeInitialCommand("summarize this repository"),
    "summarize this repository",
  );
});
