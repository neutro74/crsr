import test from "node:test";
import assert from "node:assert/strict";
import { tokenizeCommandInput } from "../src/shell/tokenize.js";

test("tokenizeCommandInput preserves ordinary backslashes in paths", () => {
  const result = tokenizeCommandInput(String.raw`workspace C:\Users\David\project`);
  assert.deepEqual(result, {
    tokens: ["workspace", String.raw`C:\Users\David\project`],
  });
});

test("tokenizeCommandInput supports escaped spaces outside quotes", () => {
  const result = tokenizeCommandInput(String.raw`workspace My\ Project`);
  assert.deepEqual(result, {
    tokens: ["workspace", "My Project"],
  });
});

test("tokenizeCommandInput keeps a trailing backslash", () => {
  const result = tokenizeCommandInput(String.raw`workspace C:\temp\`);
  assert.deepEqual(result, {
    tokens: ["workspace", String.raw`C:\temp\`],
  });
});

test("tokenizeCommandInput returns a friendly error for unterminated quotes", () => {
  const result = tokenizeCommandInput(`header add "X-Test: value`);
  assert.deepEqual(result, {
    error: 'Unterminated quoted string. Close the " quote and try again.',
  });
});
