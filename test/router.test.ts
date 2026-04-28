import test from "node:test";
import assert from "node:assert/strict";
import { TokenizeError, tokenize } from "../src/shell/router.js";

test("tokenize preserves ordinary backslashes inside unquoted arguments", () => {
  assert.deepEqual(tokenize("workspace C:\\Users\\david\\project"), [
    "workspace",
    "C:\\Users\\david\\project",
  ]);
});

test("tokenize supports escaped spaces and quotes", () => {
  assert.deepEqual(tokenize(String.raw`header add X-Path:\ C:\\Temp\\\"quoted\"`), [
    "header",
    "add",
    String.raw`X-Path: C:\Temp\"quoted"`,
  ]);
});

test("tokenize keeps a trailing backslash instead of dropping it", () => {
  assert.deepEqual(tokenize("workspace C:\\temp\\"), [
    "workspace",
    "C:\\temp\\",
  ]);
});

test("tokenize rejects unterminated quotes", () => {
  assert.throws(
    () => tokenize(`workspace "unterminated`),
    (error: unknown) =>
      error instanceof TokenizeError &&
      error.message === 'Unterminated " quote in command.',
  );
});
