import assert from "node:assert/strict";
import test from "node:test";
import { getShellInvocation } from "../src/runtime/localShell.ts";

test("getShellInvocation uses login flags for bash-compatible shells", () => {
  assert.deepEqual(
    getShellInvocation("/bin/bash", "echo hi", "linux"),
    ["-lc", "echo hi"],
  );
  assert.deepEqual(
    getShellInvocation("/usr/bin/zsh", "echo hi", "linux"),
    ["-lc", "echo hi"],
  );
});

test("getShellInvocation uses fish-compatible flags", () => {
  assert.deepEqual(
    getShellInvocation("/usr/bin/fish", "echo hi", "linux"),
    ["-l", "-c", "echo hi"],
  );
});

test("getShellInvocation falls back to a simple -c for other unix shells", () => {
  assert.deepEqual(
    getShellInvocation("/bin/dash", "echo hi", "linux"),
    ["-c", "echo hi"],
  );
});

test("getShellInvocation uses cmd semantics on Windows cmd.exe", () => {
  assert.deepEqual(
    getShellInvocation("C:\\Windows\\System32\\cmd.exe", "dir", "win32"),
    ["/d", "/s", "/c", "dir"],
  );
});
