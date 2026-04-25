import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { getReleaseAssetName, isLocalWrapperInstall } from "../src/update.js";

test("getReleaseAssetName returns the expected asset for the current platform", () => {
  const expected = (() => {
    if (process.platform === "linux" && process.arch === "x64") {
      return "crsr-linux-x64";
    }
    if (process.platform === "darwin" && process.arch === "x64") {
      return "crsr-macos-x64";
    }
    if (process.platform === "darwin" && process.arch === "arm64") {
      return "crsr-macos-arm64";
    }
    if (process.platform === "win32" && process.arch === "x64") {
      return "crsr-win-x64.exe";
    }
    return null;
  })();

  if (expected === null) {
    assert.throws(() => getReleaseAssetName(), /No GitHub release binary/);
    return;
  }

  assert.equal(getReleaseAssetName(), expected);
});

test("isLocalWrapperInstall detects the source wrapper format", async () => {
  if (process.platform === "win32") {
    return;
  }

  const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "crsr-wrapper-test-"));
  const wrapperPath = path.join(tempDirectory, "crsr");
  const binaryPath = path.join(tempDirectory, "crsr-bin");

  try {
    writeFileSync(
      wrapperPath,
      '#!/bin/sh\nexport CRSR_INSTALL_PATH="/tmp/crsr"\nexec node "/tmp/dist/crsr.cjs" "$@"\n',
      "utf8",
    );
    writeFileSync(binaryPath, "not a wrapper", "utf8");

    assert.equal(await isLocalWrapperInstall(wrapperPath), true);
    assert.equal(await isLocalWrapperInstall(binaryPath), false);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});
