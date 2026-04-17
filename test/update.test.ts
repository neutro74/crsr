import test from "node:test";
import assert from "node:assert/strict";
import {
  getReleaseAssetNames,
  looksLikeLocalWrapperScript,
  resolveReleaseAsset,
} from "../src/update.js";

test("getReleaseAssetNames prefers native macOS arm64 builds", () => {
  assert.deepEqual(getReleaseAssetNames("darwin", "arm64"), [
    "crsr-macos-arm64",
    "crsr-macos-x64",
  ]);
});

test("resolveReleaseAsset requires checksummed browser downloads", () => {
  assert.throws(
    () =>
      resolveReleaseAsset(
        [
          {
            name: "crsr-linux-x64",
            browser_download_url: "https://example.com/crsr-linux-x64",
          },
        ],
        "linux",
        "x64",
      ),
    /missing a sha256 digest/u,
  );
});

test("resolveReleaseAsset picks the first matching preferred asset", () => {
  const asset = resolveReleaseAsset(
    [
      {
        name: "crsr-macos-x64",
        browser_download_url: "https://example.com/crsr-macos-x64",
        digest: "sha256:x64",
      },
      {
        name: "crsr-macos-arm64",
        browser_download_url: "https://example.com/crsr-macos-arm64",
        digest: "sha256:arm64",
      },
    ],
    "darwin",
    "arm64",
  );

  assert.deepEqual(asset, {
    name: "crsr-macos-arm64",
    browserDownloadUrl: "https://example.com/crsr-macos-arm64",
    digest: "sha256:arm64",
  });
});

test("looksLikeLocalWrapperScript detects source installs", () => {
  const wrapper = `#!/bin/sh
export CRSR_INSTALL_PATH="/home/test/.local/bin/crsr"
exec node "/workspace/dist/crsr.cjs" "$@"
`;

  assert.equal(looksLikeLocalWrapperScript(wrapper), true);
  assert.equal(looksLikeLocalWrapperScript("binary-data"), false);
});
