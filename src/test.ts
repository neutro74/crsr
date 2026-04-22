import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeInitialCommand,
  parseCliArguments,
} from "./cli.js";
import { tokenize } from "./shell/router.js";
import {
  getReleaseAssetNameForPlatform,
  isLikelyLocalWrapperScript,
} from "./update.js";

test("parseCliArguments accepts -- and keeps dashed prompt text", () => {
  const parsed = parseCliArguments(["--once", "--", "--not-a-flag", "hello"]);
  assert.deepEqual(parsed, {
    kind: "ok",
    options: {
      oneShot: true,
      update: false,
      initialCommand: "--not-a-flag hello",
    },
  });
});

test("parseCliArguments rejects missing workspace path", () => {
  const parsed = parseCliArguments(["--workspace"]);
  assert.deepEqual(parsed, {
    kind: "error",
    message: "--workspace requires a path.",
  });
});

test("parseCliArguments rejects unknown options", () => {
  const parsed = parseCliArguments(["--mystery"]);
  assert.deepEqual(parsed, {
    kind: "error",
    message: 'Unknown option "--mystery". Run crsr --help to see supported flags.',
  });
});

test("normalizeInitialCommand promotes known commands to slash commands", () => {
  assert.equal(normalizeInitialCommand("status"), "/status");
  assert.equal(normalizeInitialCommand("hello world"), "hello world");
});

test("tokenize preserves windows-style paths and escaped spaces", () => {
  assert.deepEqual(tokenize(String.raw`workspace C:\Users\David\My\ Repo`), [
    "workspace",
    String.raw`C:\Users\David\My Repo`,
  ]);
});

test("tokenize keeps trailing backslashes", () => {
  assert.deepEqual(tokenize("workspace C:\\Users\\David\\\\"), [
    "workspace",
    "C:\\Users\\David\\",
  ]);
});

test("tokenize reports unterminated quotes", () => {
  assert.throws(() => tokenize(`workspace "broken path`), /Unterminated " quote\./);
});

test("getReleaseAssetNameForPlatform selects exact packaged asset", () => {
  assert.equal(getReleaseAssetNameForPlatform("linux", "x64"), "crsr-linux-x64");
  assert.equal(getReleaseAssetNameForPlatform("darwin", "x64"), "crsr-macos-x64");
  assert.equal(
    getReleaseAssetNameForPlatform("darwin", "arm64"),
    "crsr-macos-arm64",
  );
  assert.equal(
    getReleaseAssetNameForPlatform("win32", "x64"),
    "crsr-win-x64.exe",
  );
});

test("isLikelyLocalWrapperScript detects source install wrapper", () => {
  assert.equal(
    isLikelyLocalWrapperScript(
      '#!/bin/sh\nexport CRSR_INSTALL_PATH="/home/user/.local/bin/crsr"\nexec node "/repo/dist/crsr.cjs" "$@"\n',
    ),
    true,
  );
  assert.equal(isLikelyLocalWrapperScript("#!/bin/sh\nexec ./crsr \"$@\"\n"), false);
});
