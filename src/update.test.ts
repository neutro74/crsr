import test from "node:test";
import assert from "node:assert/strict";
import {
  getDownloadUrl,
  getReleaseAssetName,
  isWrapperInstallScript,
} from "./update.js";

test("getReleaseAssetName chooses native Apple Silicon asset", () => {
  assert.equal(getReleaseAssetName("darwin", "arm64"), "crsr-macos-arm64");
});

test("getReleaseAssetName rejects unsupported platforms", () => {
  assert.throws(
    () => getReleaseAssetName("linux", "arm64"),
    /No GitHub release binary/,
  );
});

test("getDownloadUrl requires browser download URL", () => {
  assert.throws(
    () =>
      getDownloadUrl({
        name: "crsr-linux-x64",
        url: "https://api.github.com/repos/example/releases/assets/1",
      }),
    /browser_download_url/,
  );
});

test("isWrapperInstallScript detects local wrapper launchers", () => {
  const wrapper = Buffer.from(
    '#!/bin/sh\nexport CRSR_INSTALL_PATH="/home/test/.local/bin/crsr"\nexec node "/repo/dist/crsr.cjs" "$@"\n',
    "utf8",
  );
  assert.equal(isWrapperInstallScript(wrapper), true);
});

test("isWrapperInstallScript ignores packaged binaries", () => {
  const binaryLike = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]);
  assert.equal(isWrapperInstallScript(binaryLike), false);
});
