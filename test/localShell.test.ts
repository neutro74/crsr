import assert from "node:assert/strict";
import test from "node:test";
import { getShellExecutionPlan } from "../src/runtime/localShell.ts";

test("getShellExecutionPlan uses login-compatible args for bash on posix", () => {
  const plan = getShellExecutionPlan("pwd", {
    env: { SHELL: "/bin/bash" },
    platform: "linux",
  });

  assert.deepStrictEqual(plan, {
    shell: "/bin/bash",
    args: ["-lc", "pwd"],
  });
});

test("getShellExecutionPlan falls back to -c for fish on posix", () => {
  const plan = getShellExecutionPlan("pwd", {
    env: { SHELL: "/usr/bin/fish" },
    platform: "linux",
  });

  assert.deepStrictEqual(plan, {
    shell: "/usr/bin/fish",
    args: ["-c", "pwd"],
  });
});

test("getShellExecutionPlan uses cmd.exe args on Windows when COMSPEC is set", () => {
  const plan = getShellExecutionPlan("dir", {
    env: { COMSPEC: "C:\\Windows\\System32\\cmd.exe" },
    platform: "win32",
  });

  assert.deepStrictEqual(plan, {
    shell: "C:\\Windows\\System32\\cmd.exe",
    args: ["/d", "/s", "/c", "dir"],
  });
});

test("getShellExecutionPlan respects an explicit bash shell on Windows", () => {
  const plan = getShellExecutionPlan("pwd", {
    env: { SHELL: "C:\\Program Files\\Git\\bin\\bash.exe" },
    platform: "win32",
  });

  assert.deepStrictEqual(plan, {
    shell: "C:\\Program Files\\Git\\bin\\bash.exe",
    args: ["-lc", "pwd"],
  });
});

test("getShellExecutionPlan uses PowerShell flags when pwsh is configured", () => {
  const plan = getShellExecutionPlan("Get-Location", {
    env: { SHELL: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" },
    platform: "win32",
  });

  assert.deepStrictEqual(plan, {
    shell: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
    args: ["-NoLogo", "-NoProfile", "-Command", "Get-Location"],
  });
});
