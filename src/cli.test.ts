import test from "node:test";
import assert from "node:assert/strict";
import { normalizeInitialCommand, parseCliArguments } from "./cli.js";

test("parseCliArguments requires a workspace path", () => {
  const result = parseCliArguments(["--workspace"]);

  assert.deepEqual(result, {
    kind: "error",
    message: "--workspace requires a path.",
  });
});

test("parseCliArguments rejects combining update with other modes", () => {
  const result = parseCliArguments(["--update", "--once"]);

  assert.deepEqual(result, {
    kind: "error",
    message: "--update cannot be combined with --once, --workspace, or an initial command.",
  });
});

test("parseCliArguments keeps commands after double dash", () => {
  const result = parseCliArguments(["--once", "--", "--not-a-flag", "value"]);

  assert.deepEqual(result, {
    oneShot: true,
    update: false,
    initialCommand: "--not-a-flag value",
  });
});

test("normalizeInitialCommand prefixes known slash commands", () => {
  assert.equal(normalizeInitialCommand("status"), "/status");
  assert.equal(normalizeInitialCommand("plain prompt"), "plain prompt");
});
