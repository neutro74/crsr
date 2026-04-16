import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWorktreeDelegateArgs,
  tokenizeCommandInput,
} from "../src/shell/commandParsing.js";

function expectTokens(input: string): string[] {
  const parsed = tokenizeCommandInput(input);
  assert.equal(parsed.ok, true);
  return parsed.tokens;
}

test("tokenizeCommandInput preserves Windows paths and escaped spaces", () => {
  assert.deepEqual(expectTokens("nvim C:\\Users\\David\\notes.txt"), [
    "nvim",
    "C:\\Users\\David\\notes.txt",
  ]);
  assert.deepEqual(expectTokens("workspace My\\ Project"), [
    "workspace",
    "My Project",
  ]);
});

test("tokenizeCommandInput reports unterminated quotes", () => {
  const parsed = tokenizeCommandInput('header add "Authorization: Bearer test');
  assert.deepEqual(parsed, {
    ok: false,
    message: "Unterminated double quote.",
  });
});

test("tokenizeCommandInput treats blank slash input as empty", () => {
  assert.deepEqual(expectTokens("   "), []);
});

test("tokenizeCommandInput keeps a trailing backslash literal", () => {
  assert.deepEqual(expectTokens("model foo\\"), ["model", "foo\\"]);
});

test("buildWorktreeDelegateArgs validates /worktree --base usage", () => {
  const missingBase = buildWorktreeDelegateArgs(["feature", "--base"]);
  assert.deepEqual(missingBase, {
    ok: false,
    message: "Usage: /worktree [name] [--base <branch>] [--skip-setup]",
  });

  const flagAsBase = buildWorktreeDelegateArgs([
    "feature",
    "--base",
    "--skip-setup",
  ]);
  assert.deepEqual(flagAsBase, {
    ok: false,
    message: "Usage: /worktree [name] [--base <branch>] [--skip-setup]",
  });
});

test("buildWorktreeDelegateArgs builds delegated worktree arguments", () => {
  const parsed = buildWorktreeDelegateArgs([
    "feature",
    "--base",
    "main",
    "--skip-setup",
  ]);
  assert.deepEqual(parsed, {
    ok: true,
    args: [
      "-w",
      "feature",
      "--worktree-base",
      "main",
      "--skip-worktree-setup",
    ],
  });
});
