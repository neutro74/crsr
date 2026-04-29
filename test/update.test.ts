import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  getReleaseAssetNameForTarget,
  isWrapperInstallPath,
} from "../src/update.js";

test("getReleaseAssetNameForTarget maps supported targets", () => {
  assert.equal(getReleaseAssetNameForTarget("linux", "x64"), "crsr-linux-x64");
  assert.equal(getReleaseAssetNameForTarget("darwin", "x64"), "crsr-macos-x64");
  assert.equal(getReleaseAssetNameForTarget("darwin", "arm64"), "crsr-macos-arm64");
  assert.equal(getReleaseAssetNameForTarget("win32", "x64"), "crsr-win-x64.exe");
});

test("getReleaseAssetNameForTarget rejects unsupported targets", () => {
  assert.throws(
    () => getReleaseAssetNameForTarget("linux", "arm64"),
    /No GitHub release binary/,
  );
});

test("isWrapperInstallPath identifies the local source wrapper", async () => {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "crsr-wrapper-test-"));
  const wrapperPath = path.join(tempDirectory, "crsr");

  try {
    await writeFile(
      wrapperPath,
      '#!/bin/sh\nexport CRSR_INSTALL_PATH="/tmp/crsr"\nexec node "/repo/dist/crsr.cjs" "$@"\n',
      "utf8",
    );
    assert.equal(await isWrapperInstallPath(wrapperPath), true);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test("isWrapperInstallPath ignores standalone binaries and unrelated scripts", async () => {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "crsr-wrapper-test-"));
  const scriptPath = path.join(tempDirectory, "crsr");
  const exePath = path.join(tempDirectory, "crsr.exe");

  try {
    await writeFile(scriptPath, '#!/bin/sh\necho "hello"\n', "utf8");
    await writeFile(exePath, "binary", "utf8");

    assert.equal(await isWrapperInstallPath(scriptPath), false);
    assert.equal(await isWrapperInstallPath(exePath), false);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
