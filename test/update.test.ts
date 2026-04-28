import test from "node:test";
import assert from "node:assert/strict";
import {
  getReleaseAssetNameForTarget,
  getWrapperInstallPath,
  isPackagedProcess,
  isWrapperInstallPath,
} from "../src/update.js";

test("getReleaseAssetNameForTarget selects packaged assets per platform", () => {
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

test("getWrapperInstallPath reads and trims CRSR_INSTALL_PATH", () => {
  assert.equal(getWrapperInstallPath({ CRSR_INSTALL_PATH: "  /tmp/crsr  " }), "/tmp/crsr");
  assert.equal(getWrapperInstallPath({}), null);
  assert.equal(getWrapperInstallPath({ CRSR_INSTALL_PATH: "   " }), null);
});

test("isWrapperInstallPath only matches the shell wrapper path", () => {
  assert.equal(isWrapperInstallPath("/home/test/.local/bin/crsr"), true);
  assert.equal(isWrapperInstallPath("/tmp/crsr-linux-x64"), false);
  assert.equal(isWrapperInstallPath("/tmp/crsr.exe"), false);
});

test("isPackagedProcess detects pkg runtime marker", () => {
  assert.equal(isPackagedProcess({ pkg: {} } as unknown as NodeJS.Process), true);
  assert.equal(isPackagedProcess({} as unknown as NodeJS.Process), false);
});
