import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeInitialCommand,
  parseCliArguments,
  renderHelp,
  renderVersion,
} from "../src/cli.ts";
import { getShellInvocation } from "../src/runtime/localShell.ts";

test("parseCliArguments rejects a missing workspace value", () => {
  assert.deepEqual(parseCliArguments(["--workspace"]), {
    kind: "error",
    message: "--workspace requires a path value.",
  });

  assert.deepEqual(parseCliArguments(["--workspace", "--once"]), {
    kind: "error",
    message: "--workspace requires a path value.",
  });
});

test("parseCliArguments accepts -- and preserves later input", () => {
  assert.deepEqual(parseCliArguments(["--once", "--", "--help"]), {
    kind: "ok",
    options: {
      oneShot: true,
      update: false,
      initialCommand: "--help",
    },
  });
});

test("parseCliArguments keeps workspace and remaining input together", () => {
  assert.deepEqual(parseCliArguments(["--workspace", "/tmp/demo", "/status"]), {
    kind: "ok",
    options: {
      oneShot: false,
      update: false,
      workspace: "/tmp/demo",
      initialCommand: "/status",
    },
  });
});

test("normalizeInitialCommand auto-prefixes known commands only", () => {
  assert.equal(normalizeInitialCommand("status"), "/status");
  assert.equal(
    normalizeInitialCommand("summarize this repository"),
    "summarize this repository",
  );
});

test("render helpers include versioned CLI output", () => {
  assert.match(renderHelp(), /--\s+Stop parsing options/u);
  assert.match(renderVersion(), /^crsr \d+\.\d+\.\d+/u);
});

test("getShellInvocation uses platform-appropriate flags", () => {
  assert.deepEqual(getShellInvocation("bash", "pwd", "linux"), ["-lc", "pwd"]);
  assert.deepEqual(getShellInvocation("powershell", "Get-Location", "win32"), [
    "-Command",
    "Get-Location",
  ]);
  assert.deepEqual(getShellInvocation("pwsh.exe", "Get-ChildItem", "win32"), [
    "-Command",
    "Get-ChildItem",
  ]);
  assert.deepEqual(getShellInvocation("C:\\Windows\\System32\\cmd.exe", "dir", "win32"), [
    "/d",
    "/s",
    "/c",
    "dir",
  ]);
  assert.deepEqual(getShellInvocation("C:\\Program Files\\Git\\bin\\bash.exe", "pwd", "win32"), [
    "-lc",
    "pwd",
  ]);
});
