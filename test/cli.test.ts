import test from "node:test";
import assert from "node:assert/strict";
import {
  CliParseError,
  normalizeInitialCommand,
  parseCliArguments,
} from "../src/cli.js";

test("parseCliArguments rejects missing workspace value", () => {
  assert.throws(
    () => parseCliArguments(["--workspace"]),
    (error: unknown) =>
      error instanceof CliParseError &&
      error.message === "--workspace requires a path.",
  );
});

test("parseCliArguments supports explicit -- separator", () => {
  const options = parseCliArguments(["--once", "--", "status", "summary"]);
  assert.deepEqual(options, {
    oneShot: true,
    update: false,
    initialCommand: "status summary",
  });
});

test("normalizeInitialCommand prefixes known commands", () => {
  assert.equal(normalizeInitialCommand("status"), "/status");
  assert.equal(normalizeInitialCommand("mcp list"), "/mcp list");
  assert.equal(normalizeInitialCommand("summarize repo"), "summarize repo");
});
