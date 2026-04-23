import test from "node:test";
import assert from "node:assert/strict";
import { normalizeInitialCommand, parseCliArguments } from "./cli.js";

test("parseCliArguments accepts flags before and after the initial command", () => {
  assert.deepEqual(parseCliArguments(["summarize", "--once"]), {
    initialCommand: "summarize",
    oneShot: true,
    update: false,
  });

  assert.deepEqual(
    parseCliArguments(["summarize", "--workspace", "/tmp/project", "--once"]),
    {
      initialCommand: "summarize",
      oneShot: true,
      update: false,
      workspace: "/tmp/project",
    },
  );
});

test("parseCliArguments rejects missing workspace values", () => {
  assert.deepEqual(parseCliArguments(["--workspace"]), {
    kind: "error",
    message:
      "--workspace requires a path value. Example: crsr --workspace ~/project",
  });

  assert.deepEqual(parseCliArguments(["--workspace", "--once"]), {
    kind: "error",
    message:
      "--workspace requires a path value. Example: crsr --workspace ~/project",
  });
});

test("parseCliArguments allows leading-dash prompts after a command token", () => {
  assert.deepEqual(parseCliArguments(["/raw", "--help"]), {
    initialCommand: "/raw --help",
    oneShot: false,
    update: false,
  });

  assert.deepEqual(parseCliArguments(["prompt", "--", "--literal-flag"]), {
    initialCommand: "prompt --literal-flag",
    oneShot: false,
    update: false,
  });
});

test("parseCliArguments rejects invalid update combinations", () => {
  assert.deepEqual(parseCliArguments(["--update", "--once"]), {
    kind: "error",
    message: "--update cannot be combined with --once.",
  });

  assert.deepEqual(parseCliArguments(["--update", "prompt"]), {
    kind: "error",
    message: "--update does not accept an initial command or prompt.",
  });
});

test("normalizeInitialCommand prefixes known shell commands", () => {
  assert.equal(normalizeInitialCommand("status"), "/status");
  assert.equal(normalizeInitialCommand("mcp list"), "/mcp list");
  assert.equal(normalizeInitialCommand("plain prompt"), "plain prompt");
});
