import test from "node:test";
import assert from "node:assert/strict";
import { tokenize } from "../src/shell/tokenize.ts";

test("tokenize preserves Windows-style backslashes", () => {
  assert.deepEqual(tokenize("workspace C:\\Users\\David\\project"), [
    "workspace",
    "C:\\Users\\David\\project",
  ]);
});

test("tokenize supports escaped spaces", () => {
  assert.deepEqual(tokenize("workspace my\\ project"), [
    "workspace",
    "my project",
  ]);
});

test("tokenize rejects unterminated quotes", () => {
  assert.throws(
    () => tokenize('workspace "unterminated'),
    /Unterminated double quote/,
  );
});
