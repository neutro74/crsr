import test from "node:test";
import assert from "node:assert/strict";
import { normalizeInitialCommand, parseCliArguments } from "../src/cli.js";

test("parseCliArguments accepts --workspace=<path>", () => {
  const result = parseCliArguments(["--workspace=/tmp/demo", "--once", "status"]);
  assert.notStrictEqual(result, "help");
  assert.notStrictEqual(result, "version");
  assert.deepEqual(result, {
    workspace: "/tmp/demo",
    oneShot: true,
    update: false,
    initialCommand: "status",
  });
});

test("parseCliArguments rejects missing --workspace value", () => {
  assert.throws(
    () => parseCliArguments(["--workspace", "--once"]),
    /--workspace requires a path/,
  );
});

test("parseCliArguments supports -- to preserve prompts starting with dash", () => {
  const result = parseCliArguments(["--once", "--", "-summarize this repo"]);
  assert.notStrictEqual(result, "help");
  assert.notStrictEqual(result, "version");
  assert.deepEqual(result, {
    oneShot: true,
    update: false,
    initialCommand: "-summarize this repo",
  });
});

test("parseCliArguments rejects unknown options", () => {
  assert.throws(
    () => parseCliArguments(["--bogus"]),
    /Unknown option "--bogus"/,
  );
});

test("normalizeInitialCommand trims and prefixes known slash commands", () => {
  assert.equal(normalizeInitialCommand("  status  "), "/status");
  assert.equal(normalizeInitialCommand("  !pwd  "), "!pwd");
  assert.equal(normalizeInitialCommand("   "), undefined);
  assert.equal(
    normalizeInitialCommand("  summarize the repository  "),
    "summarize the repository",
  );
});
