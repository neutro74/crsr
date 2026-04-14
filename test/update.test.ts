import assert from "node:assert/strict";
import test from "node:test";
import {
  getDownloadUrl,
  getReleaseAssetNameForPlatform,
  getRequiredDigest,
  isLocalWrapperInstall,
  type ReleaseAsset,
} from "../src/update.ts";

test("getReleaseAssetNameForPlatform selects the native macOS arm64 asset", () => {
  assert.equal(
    getReleaseAssetNameForPlatform("darwin", "arm64"),
    "crsr-macos-arm64",
  );
});

test("getDownloadUrl requires a browser download URL", () => {
  const asset: ReleaseAsset = { name: "crsr-linux-x64" };

  assert.throws(
    () => getDownloadUrl(asset),
    /does not include a browser download URL/u,
  );
});

test("getRequiredDigest requires a sha256 digest", () => {
  const asset: ReleaseAsset = {
    name: "crsr-linux-x64",
    browser_download_url: "https://example.com/crsr-linux-x64",
  };

  assert.throws(
    () => getRequiredDigest(asset),
    /missing a sha256 digest/u,
  );
});

test("isLocalWrapperInstall detects the source-installed wrapper script", () => {
  assert.equal(
    isLocalWrapperInstall(
      "#!/bin/sh\nexport CRSR_INSTALL_PATH=\"/home/user/.local/bin/crsr\"\nexec node \"/repo/dist/crsr.cjs\" \"$@\"\n",
    ),
    true,
  );
  assert.equal(isLocalWrapperInstall("\u007fELFbinary"), false);
});
