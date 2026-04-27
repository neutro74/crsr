import test from "node:test";
import assert from "node:assert/strict";
import { getShellInvocation } from "./localShell.js";

test("getShellInvocation uses bash-style flags for POSIX shells on Windows", () => {
  assert.deepEqual(
    getShellInvocation("C:\\Program Files\\Git\\bin\\bash.exe", "echo hi", "win32"),
    {
      program: "C:\\Program Files\\Git\\bin\\bash.exe",
      args: ["-lc", "echo hi"],
    },
  );
});

test("getShellInvocation uses cmd flags when cmd.exe is selected", () => {
  assert.deepEqual(getShellInvocation("cmd.exe", "dir", "win32"), {
    program: "cmd.exe",
    args: ["/d", "/s", "/c", "dir"],
  });
});

test("getShellInvocation defaults to PowerShell on Windows", () => {
  assert.deepEqual(getShellInvocation(undefined, "Get-ChildItem", "win32"), {
    program: "powershell.exe",
    args: ["-NoProfile", "-NonInteractive", "-Command", "Get-ChildItem"],
  });
});

test("getShellInvocation uses bash login shell on Linux", () => {
  assert.deepEqual(getShellInvocation(undefined, "pwd", "linux"), {
    program: "bash",
    args: ["-lc", "pwd"],
  });
});
