import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { SessionStore } from "../src/session/sessionStore.js";

function createSessionFilePath(): string {
  const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "crsr-session-store-"));
  mkdirSync(tempDirectory, { recursive: true });
  return path.join(tempDirectory, "session.json");
}

test("SessionStore normalizes persisted workspaces on load", () => {
  const sessionFile = createSessionFilePath();
  writeFileSync(
    sessionFile,
    JSON.stringify(
      {
        activeWorkspace: ".",
        recentWorkspaces: [".", ".."],
        commandHistory: [],
        mode: "normal",
        forceMode: false,
        sandbox: null,
        approveMcps: false,
        customHeaders: [],
        theme: "dark",
        vimMode: false,
      },
      null,
      2,
    ),
  );

  const store = new SessionStore(sessionFile);
  const snapshot = store.getSnapshot();

  assert.equal(snapshot.activeWorkspace, path.resolve("."));
  assert.deepEqual(snapshot.recentWorkspaces, [path.resolve("."), path.resolve("..")]);
});

test("SessionStore writes atomically without leaving temporary files", () => {
  const sessionFile = createSessionFilePath();
  const store = new SessionStore(sessionFile);

  store.recordCommand("/help");

  const raw = readFileSync(sessionFile, "utf8");
  const parsed = JSON.parse(raw) as { commandHistory: string[] };
  assert.deepEqual(parsed.commandHistory, ["/help"]);

  const directoryEntries = readdirSync(path.dirname(sessionFile));
  assert.deepEqual(directoryEntries, ["session.json"]);
});
