import test from "node:test";
import assert from "node:assert/strict";
import { normalizeInitialCommand, parseCliArguments } from "./cli.js";

test("parseCliArguments rejects missing workspace path", () => {
  const result = parseCliArguments(["--workspace"]);
  assert.deepEqual(result, {
    kind: "error",
    message: "--workspace requires a path.",
  });
});

test("parseCliArguments rejects workspace followed by another flag", () => {
  const result = parseCliArguments(["--workspace", "--once"]);
  assert.deepEqual(result, {
    kind: "error",
    message: "--workspace requires a path.",
  });
});

test("parseCliArguments supports -- passthrough prompts", () => {
  const result = parseCliArguments(["--once", "--", "--workspace ./tmp"]);
  assert.deepEqual(result, {
    oneShot: true,
    update: false,
    initialCommand: "--workspace ./tmp",
  });
});

test("normalizeInitialCommand prefixes known shell commands", () => {
  assert.equal(normalizeInitialCommand("help"), "/help");
  assert.equal(normalizeInitialCommand("mcp list"), "/mcp list");
  assert.equal(normalizeInitialCommand("plain prompt"), "plain prompt");
});
