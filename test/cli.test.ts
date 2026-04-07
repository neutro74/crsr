import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeInitialCommand,
  parseCliArguments,
} from "../src/cli.js";

test("parseCliArguments accepts --workspace=<path>", () => {
  const result = parseCliArguments([
    "--workspace=/tmp/project",
    "--once",
    "/status",
  ]);

  assert.equal(result.kind, "options");
  if (result.kind !== "options") {
    return;
  }

  assert.deepEqual(result.options, {
    workspace: "/tmp/project",
    oneShot: true,
    update: false,
    initialCommand: "/status",
  });
});

test("parseCliArguments rejects a missing workspace value", () => {
  const result = parseCliArguments(["--workspace"]);

  assert.deepEqual(result, {
    kind: "error",
    message: "--workspace requires a path value.",
  });
});

test("parseCliArguments treats arguments after -- as prompt text", () => {
  const result = parseCliArguments(["--once", "--", "--help"]);

  assert.equal(result.kind, "options");
  if (result.kind !== "options") {
    return;
  }

  assert.deepEqual(result.options, {
    oneShot: true,
    update: false,
    initialCommand: "--help",
  });
});

test("normalizeInitialCommand prefixes known slash commands", () => {
  assert.equal(normalizeInitialCommand("mcp list"), "/mcp list");
  assert.equal(
    normalizeInitialCommand("summarize this repository"),
    "summarize this repository",
  );
});
