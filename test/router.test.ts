import test from "node:test";
import assert from "node:assert/strict";
import { tokenize } from "../src/shell/router.js";

test("tokenize preserves ordinary backslashes inside tokens", () => {
  assert.deepEqual(tokenize("workspace C:\\Users\\david\\repo"), {
    tokens: ["workspace", "C:\\Users\\david\\repo"],
  });
});

test("tokenize keeps a trailing backslash instead of dropping it", () => {
  assert.deepEqual(tokenize("workspace foo\\"), {
    tokens: ["workspace", "foo\\"],
  });
});

test("tokenize supports escaped spaces", () => {
  assert.deepEqual(tokenize("workspace foo\\ bar"), {
    tokens: ["workspace", "foo bar"],
  });
});

test("tokenize reports unterminated quotes", () => {
  assert.deepEqual(tokenize('workspace "unterminated'), {
    tokens: ["workspace"],
    error: "Unterminated double quote in command.",
  });
});
