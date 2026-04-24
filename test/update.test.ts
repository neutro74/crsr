import test from "node:test";
import assert from "node:assert/strict";
import {
  getReleaseAssetNameForTarget,
  getVerifiedAssetDownloadMetadata,
  isWrapperInstallScript,
} from "../src/update.ts";

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

test("isWrapperInstallScript detects the local node wrapper", () => {
  assert.equal(
    isWrapperInstallScript(
      '#!/bin/sh\nexport CRSR_INSTALL_PATH="/home/test/.local/bin/crsr"\nexec node "/repo/dist/crsr.cjs" "$@"\n',
    ),
    true,
  );
  assert.equal(isWrapperInstallScript("binary content placeholder"), false);
});

test("getVerifiedAssetDownloadMetadata requires browser download URL and digest", () => {
  assert.deepEqual(
    getVerifiedAssetDownloadMetadata({
      name: "crsr-linux-x64",
      browser_download_url: "https://example.test/crsr-linux-x64",
      digest: "sha256:abc123",
    }),
    {
      downloadUrl: "https://example.test/crsr-linux-x64",
      digest: "sha256:abc123",
    },
  );

  assert.throws(
    () =>
      getVerifiedAssetDownloadMetadata({
        name: "crsr-linux-x64",
        digest: "sha256:abc123",
      }),
    /does not include a browser download URL/,
  );

  assert.throws(
    () =>
      getVerifiedAssetDownloadMetadata({
        name: "crsr-linux-x64",
        browser_download_url: "https://example.test/crsr-linux-x64",
      }),
    /missing a sha256 digest/,
  );
});
