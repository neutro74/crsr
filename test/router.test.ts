import assert from "node:assert/strict";
import test from "node:test";
import { tokenizeCommandInput } from "../src/shell/router.js";

test("tokenizeCommandInput preserves ordinary backslashes", () => {
  const result = tokenizeCommandInput(String.raw`workspace C:\Users\david\project`);
  assert.deepEqual(result, {
    ok: true,
    tokens: ["workspace", String.raw`C:\Users\david\project`],
  });
});

test("tokenizeCommandInput supports escaped spaces and empty quoted values", () => {
  assert.deepEqual(tokenizeCommandInput(String.raw`workspace My\ Project`), {
    ok: true,
    tokens: ["workspace", "My Project"],
  });
  assert.deepEqual(tokenizeCommandInput('raw "" next'), {
    ok: true,
    tokens: ["raw", "", "next"],
  });
});

test("tokenizeCommandInput reports unterminated quotes", () => {
  const result = tokenizeCommandInput('workspace "unterminated');
  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("Expected parse failure");
  }
  assert.match(result.error, /Unterminated "/);
});
