import test from "node:test";
import assert from "node:assert/strict";
import { normalizeInitialCommand, parseCliArguments } from "../src/cli.js";

test("parseCliArguments handles -- delimiter for dashed prompts", () => {
  const result = parseCliArguments(["--once", "--", "--explain this repo"]);
  assert.equal(result.kind, "run");
  if (result.kind !== "run") {
    return;
  }

  assert.deepEqual(result.options, {
    oneShot: true,
    update: false,
    initialCommand: "--explain this repo",
  });
});

test("parseCliArguments rejects missing workspace value", () => {
  const result = parseCliArguments(["--workspace"]);
  assert.deepEqual(result, {
    kind: "error",
    message:
      "--workspace requires a path. Use '-- --workspace' if your prompt starts with a dash.",
  });
});

test("parseCliArguments rejects unknown options", () => {
  const result = parseCliArguments(["--mystery"]);
  assert.deepEqual(result, {
    kind: "error",
    message:
      "Unknown option \"--mystery\". Run 'crsr --help' for usage, or use '--' before a prompt that starts with a dash.",
  });
});

test("normalizeInitialCommand prefixes known slash commands", () => {
  assert.equal(normalizeInitialCommand("status"), "/status");
  assert.equal(normalizeInitialCommand("mcp list"), "/mcp list");
  assert.equal(normalizeInitialCommand("summarize repo"), "summarize repo");
});
