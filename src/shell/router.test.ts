import test from "node:test";
import assert from "node:assert/strict";
import { tokenizeCommand } from "./router.js";

test("tokenizeCommand preserves backslashes in ordinary paths", () => {
  assert.deepEqual(tokenizeCommand("/workspace C:\\Users\\David\\project"), {
    tokens: ["workspace", "C:\\Users\\David\\project"],
  });
});

test("tokenizeCommand preserves trailing backslashes", () => {
  assert.deepEqual(tokenizeCommand("/workspace some\\\\"), {
    tokens: ["workspace", "some\\"],
  });
});

test("tokenizeCommand supports escaped spaces", () => {
  assert.deepEqual(tokenizeCommand("/workspace my\\ project"), {
    tokens: ["workspace", "my project"],
  });
});

test("tokenizeCommand returns a user-facing error for unterminated quotes", () => {
  assert.deepEqual(tokenizeCommand('/workspace "unterminated'), {
    error: "Unterminated quote in command. Close the quote and try again.",
  });
});
