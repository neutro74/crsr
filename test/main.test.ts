import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeInitialCommand,
  parseCliArguments,
} from "../src/main.tsx";

test("parseCliArguments supports --workspace=<path> and preserves remaining command", () => {
  const result = parseCliArguments([
    "--workspace=./repo",
    "--once",
    "status",
    "--json",
  ]);

  assert.deepStrictEqual(result, {
    workspace: "./repo",
    oneShot: true,
    update: false,
    initialCommand: "status --json",
  });
});

test("parseCliArguments stops option parsing after --", () => {
  const result = parseCliArguments(["--once", "--", "--help", "topic"]);

  assert.deepStrictEqual(result, {
    oneShot: true,
    update: false,
    initialCommand: "--help topic",
  });
});

test("parseCliArguments reports a missing workspace path", () => {
  const result = parseCliArguments(["--workspace"]);

  assert.deepStrictEqual(result, {
    error: "--workspace requires a path.",
  });
});

test("parseCliArguments reports unknown options", () => {
  const result = parseCliArguments(["--mystery-flag"]);

  assert.deepStrictEqual(result, {
    error: 'Unknown option "--mystery-flag". Run "crsr --help" to see supported flags.',
  });
});

test("normalizeInitialCommand trims slash commands and prefixes known command names", () => {
  assert.equal(normalizeInitialCommand("  /help  "), "/help");
  assert.equal(normalizeInitialCommand("status"), "/status");
  assert.equal(normalizeInitialCommand("mcp list"), "/mcp list");
  assert.equal(
    normalizeInitialCommand("summarize this repository"),
    "summarize this repository",
  );
});
