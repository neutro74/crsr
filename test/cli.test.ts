import test from "node:test";
import assert from "node:assert/strict";
import { parseCliArguments } from "../src/cli.ts";

test("parseCliArguments rejects --workspace without a path", () => {
  const result = parseCliArguments(["--workspace"]);
  assert.deepEqual(result, {
    kind: "error",
    message:
      "--workspace requires a path. Use --workspace <path> or --workspace=<path>.",
  });
});

test("parseCliArguments rejects --workspace when the next token is another flag", () => {
  const result = parseCliArguments(["--workspace", "--once"]);
  assert.deepEqual(result, {
    kind: "error",
    message:
      "--workspace requires a path. Use --workspace <path> or --workspace=<path>.",
  });
});

test("parseCliArguments supports --workspace=<path>", () => {
  const result = parseCliArguments(["--workspace=/tmp/demo", "--once", "status"]);
  assert.deepEqual(result, {
    kind: "options",
    options: {
      workspace: "/tmp/demo",
      oneShot: true,
      update: false,
      initialCommand: "status",
    },
  });
});

test("parseCliArguments treats -- as the end of option parsing", () => {
  const result = parseCliArguments(["--once", "--", "--workspace", "literal"]);
  assert.deepEqual(result, {
    kind: "options",
    options: {
      oneShot: true,
      update: false,
      initialCommand: "--workspace literal",
    },
  });
});
