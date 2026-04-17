import test from "node:test";
import assert from "node:assert/strict";
import { tokenizeCommandInput } from "../src/shell/router.js";

test("tokenizeCommandInput preserves ordinary Windows path backslashes", () => {
  assert.deepEqual(tokenizeCommandInput(String.raw`workspace C:\Users\David\project`), {
    ok: true,
    tokens: ["workspace", String.raw`C:\Users\David\project`],
  });
});

test("tokenizeCommandInput supports escaped spaces", () => {
  assert.deepEqual(tokenizeCommandInput(String.raw`workspace My\ Folder`), {
    ok: true,
    tokens: ["workspace", "My Folder"],
  });
});

test("tokenizeCommandInput preserves trailing backslashes", () => {
  assert.deepEqual(tokenizeCommandInput("nvim dir\\"), {
    ok: true,
    tokens: ["nvim", "dir\\"],
  });
});

test("tokenizeCommandInput reports unterminated quoted strings", () => {
  const result = tokenizeCommandInput(`workspace "unterminated`);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /Unterminated quoted string/u);
  }
});
