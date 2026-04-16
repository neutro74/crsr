import assert from "node:assert/strict";
import test from "node:test";
import { normalizeInitialCommand, parseCliArguments } from "../src/cli.ts";

test("parseCliArguments validates --workspace values", () => {
  assert.throws(
    () => parseCliArguments(["--workspace"]),
    /--workspace requires a path argument\./u,
  );
  assert.throws(
    () => parseCliArguments(["--workspace", "--once"]),
    /--workspace requires a path argument\./u,
  );
});

test("parseCliArguments supports -- passthrough for prompt text", () => {
  assert.deepEqual(parseCliArguments(["--once", "--", "--summarize", "this"]), {
    oneShot: true,
    update: false,
    initialCommand: "--summarize this",
  });
});

test("normalizeInitialCommand only auto-prefixes exact commands", () => {
  assert.equal(normalizeInitialCommand("status"), "/status");
  assert.equal(normalizeInitialCommand("mcp list"), "/mcp list");
  assert.equal(
    normalizeInitialCommand("plan for the migration"),
    "plan for the migration",
  );
  assert.equal(normalizeInitialCommand("!pwd"), "!pwd");
});
