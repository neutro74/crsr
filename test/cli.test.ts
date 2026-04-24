import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeInitialCommand,
  parseCliArguments,
  renderHelp,
} from "../src/cli.ts";

test("parseCliArguments accepts --workspace=value form", () => {
  const result = parseCliArguments(["--workspace=/tmp/demo", "--once", "/help"]);
  assert.equal(result.kind, "run");
  if (result.kind !== "run") return;
  assert.equal(result.options.workspace, "/tmp/demo");
  assert.equal(result.options.oneShot, true);
  assert.equal(result.options.initialCommand, "/help");
});

test("parseCliArguments rejects missing workspace value", () => {
  const result = parseCliArguments(["--workspace", "--once"]);
  assert.deepEqual(result, {
    kind: "error",
    message: "--workspace requires a path.",
  });
});

test("parseCliArguments rejects unknown options unless separated by --", () => {
  const direct = parseCliArguments(["-strange"]);
  assert.equal(direct.kind, "error");
  if (direct.kind !== "error") return;
  assert.match(direct.message, /Unknown option "-strange"/);

  const passthrough = parseCliArguments(["--", "-strange"]);
  assert.equal(passthrough.kind, "run");
  if (passthrough.kind !== "run") return;
  assert.equal(passthrough.options.initialCommand, "-strange");
});

test("normalizeInitialCommand prefixes known slash commands", () => {
  assert.equal(normalizeInitialCommand("status"), "/status");
  assert.equal(normalizeInitialCommand("mcp list"), "/mcp list");
  assert.equal(normalizeInitialCommand("hello world"), "hello world");
});

test("renderHelp documents -- passthrough usage", () => {
  const help = renderHelp();
  assert.match(help, /crsr \[options\] -- \[initial command or prompt\.\.\.\]/);
  assert.match(help, /Use -- to pass a prompt or command that starts with -/);
});
