import test from "node:test";
import assert from "node:assert/strict";
import { normalizeInitialCommand, parseCliArguments } from "../src/cli.js";

test("parseCliArguments rejects --workspace without a value", () => {
  assert.deepEqual(parseCliArguments(["--workspace"]), {
    kind: "error",
    message: "--workspace requires a path.",
  });
});

test("parseCliArguments rejects another known flag as the workspace value", () => {
  assert.deepEqual(parseCliArguments(["--workspace", "--once"]), {
    kind: "error",
    message: "--workspace requires a path.",
  });
});

test("parseCliArguments supports inline workspace values and -- to stop parsing", () => {
  assert.deepEqual(
    parseCliArguments([
      "--workspace=/tmp/demo",
      "--once",
      "--",
      "--literal",
      "prompt",
    ]),
    {
      workspace: "/tmp/demo",
      oneShot: true,
      update: false,
      initialCommand: "--literal prompt",
    },
  );
});

test("normalizeInitialCommand auto-prefixes known commands", () => {
  assert.equal(normalizeInitialCommand("status"), "/status");
  assert.equal(normalizeInitialCommand("hello world"), "hello world");
  assert.equal(normalizeInitialCommand("   "), undefined);
});
