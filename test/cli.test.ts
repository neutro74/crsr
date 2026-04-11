import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeInitialCommand,
  parseCliArguments,
} from "../src/cli.js";

test("parseCliArguments validates --workspace values", () => {
  const result = parseCliArguments(["--workspace", "--once"]);
  assert.deepEqual(result, {
    kind: "error",
    message: "--workspace requires a path.",
  });
});

test("parseCliArguments preserves commands after --", () => {
  const result = parseCliArguments(["--once", "--", "--version"]);
  assert.deepEqual(result, {
    kind: "options",
    options: {
      oneShot: true,
      update: false,
      initialCommand: "--version",
    },
  });
});

test("normalizeInitialCommand prefixes known slash commands", () => {
  assert.equal(normalizeInitialCommand("status"), "/status");
  assert.equal(
    normalizeInitialCommand("summarize this repository"),
    "summarize this repository",
  );
});
