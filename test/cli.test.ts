import assert from "node:assert/strict";
import test from "node:test";
import { normalizeInitialCommand, parseCliArguments } from "../src/cli.ts";

test("parseCliArguments rejects a missing workspace value", () => {
  const result = parseCliArguments(["--workspace"]);

  assert.deepEqual(result, {
    kind: "error",
    message: "--workspace requires a path value.",
  });
});

test("parseCliArguments does not swallow other flags as the workspace", () => {
  const result = parseCliArguments(["--workspace", "--once", "/help"]);

  assert.deepEqual(result, {
    kind: "error",
    message: "--workspace requires a path value.",
  });
});

test("parseCliArguments supports equals-style workspace values", () => {
  const result = parseCliArguments([
    "--workspace=/tmp/crsr-demo",
    "--once",
    "status",
  ]);

  assert.equal(result.kind, "run");
  assert.equal(result.options.workspace, "/tmp/crsr-demo");
  assert.equal(result.options.oneShot, true);
  assert.equal(result.options.initialCommand, "status");
});

test("normalizeInitialCommand prefixes known slash commands", () => {
  assert.equal(normalizeInitialCommand("status"), "/status");
  assert.equal(normalizeInitialCommand("hello world"), "hello world");
});
