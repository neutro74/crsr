import test from "node:test";
import assert from "node:assert/strict";
import { normalizeInitialCommand, parseCliArguments } from "../src/cli.ts";

test("parseCliArguments accepts --once and workspace", () => {
  assert.deepEqual(parseCliArguments(["--once", "--workspace", "/tmp/demo", "/status"]), {
    oneShot: true,
    update: false,
    workspace: "/tmp/demo",
    initialCommand: "/status",
  });
});

test("parseCliArguments supports -- separator for dashed prompts", () => {
  assert.deepEqual(parseCliArguments(["--", "--prompt-that-starts-with-a-dash"]), {
    oneShot: false,
    update: false,
    initialCommand: "--prompt-that-starts-with-a-dash",
  });
});

test("parseCliArguments rejects missing workspace values", () => {
  assert.throws(
    () => parseCliArguments(["--workspace"]),
    /--workspace requires a path value/,
  );
});

test("parseCliArguments rejects unknown options", () => {
  assert.throws(
    () => parseCliArguments(["--bogus"]),
    /Unknown option: --bogus/,
  );
});

test("normalizeInitialCommand prefixes known slash commands", () => {
  assert.equal(normalizeInitialCommand("status"), "/status");
  assert.equal(normalizeInitialCommand("mcp list"), "/mcp list");
});

test("normalizeInitialCommand preserves freeform prompts", () => {
  assert.equal(
    normalizeInitialCommand("summarize this repository"),
    "summarize this repository",
  );
  assert.equal(normalizeInitialCommand("   "), undefined);
});
