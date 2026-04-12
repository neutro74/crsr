import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionStore } from "../src/session/sessionStore.js";

function createTempDirectory(): string {
  return mkdtempSync(path.join(os.tmpdir(), "crsr-session-store-"));
}

test("SessionStore seeds recentWorkspaces from the initial workspace", () => {
  const tempDirectory = createTempDirectory();

  try {
    const sessionFile = path.join(tempDirectory, "session.json");
    const store = new SessionStore(sessionFile, "./workspace");
    const snapshot = store.getSnapshot();
    const expectedWorkspace = path.resolve("./workspace");

    assert.equal(snapshot.activeWorkspace, expectedWorkspace);
    assert.deepEqual(snapshot.recentWorkspaces, [expectedWorkspace]);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("SessionStore normalizes persisted workspace paths and keeps the active workspace first", () => {
  const tempDirectory = createTempDirectory();

  try {
    const sessionFile = path.join(tempDirectory, "session.json");
    writeFileSync(
      sessionFile,
      JSON.stringify({
        activeWorkspace: "./active",
        recentWorkspaces: ["./other", "./active", "./other"],
      }),
      "utf8",
    );

    const store = new SessionStore(sessionFile);
    const snapshot = store.getSnapshot();
    const activeWorkspace = path.resolve("./active");
    const otherWorkspace = path.resolve("./other");

    assert.equal(snapshot.activeWorkspace, activeWorkspace);
    assert.deepEqual(snapshot.recentWorkspaces, [
      activeWorkspace,
      otherWorkspace,
    ]);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("SessionStore recreates the session directory before saving", () => {
  const tempDirectory = createTempDirectory();

  try {
    const sessionDirectory = path.join(tempDirectory, "nested", "state");
    const sessionFile = path.join(sessionDirectory, "session.json");
    const store = new SessionStore(sessionFile);

    mkdirSync(path.dirname(sessionDirectory), { recursive: true });
    rmSync(sessionDirectory, { recursive: true, force: true });

    store.setModel("gpt-5");

    const snapshot = store.getSnapshot();
    assert.equal(snapshot.model, "gpt-5");
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});
