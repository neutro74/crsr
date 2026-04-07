import assert from "node:assert/strict";
import test from "node:test";
import { tokenizeCommandInput } from "../src/shell/router.js";

test("tokenizeCommandInput preserves backslashes in Windows paths", () => {
  const result = tokenizeCommandInput(String.raw`workspace C:\Users\David\repo`);

  assert.deepEqual(result, {
    tokens: ["workspace", String.raw`C:\Users\David\repo`],
  });
});

test("tokenizeCommandInput supports escaped spaces", () => {
  const result = tokenizeCommandInput(String.raw`workspace My\ Folder`);

  assert.deepEqual(result, {
    tokens: ["workspace", "My Folder"],
  });
});

test("tokenizeCommandInput reports unterminated quotes", () => {
  const result = tokenizeCommandInput('workspace "C:\\Users\\David');

  assert.deepEqual(result, {
    tokens: [],
    error: 'Unterminated " quote in command.',
  });
});
