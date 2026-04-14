import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { SessionStore } from "../src/session/sessionStore.ts";

test("SessionStore normalizes persisted workspaces on load", (t) => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "crsr-session-store-"));
  t.after(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  const firstWorkspace = path.join(tempRoot, "workspace-one");
  const secondWorkspace = path.join(tempRoot, "workspace-two");
  const sessionFile = path.join(tempRoot, "session.json");

  writeFileSync(
    sessionFile,
    JSON.stringify(
      {
        activeWorkspace: path.relative(process.cwd(), firstWorkspace),
        recentWorkspaces: [
          path.relative(process.cwd(), firstWorkspace),
          firstWorkspace,
          path.relative(process.cwd(), secondWorkspace),
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  const store = new SessionStore(sessionFile);
  const snapshot = store.getSnapshot();

  assert.equal(snapshot.activeWorkspace, path.resolve(firstWorkspace));
  assert.deepEqual(snapshot.recentWorkspaces, [
    path.resolve(firstWorkspace),
    path.resolve(secondWorkspace),
  ]);
});
