import test from "node:test";
import assert from "node:assert/strict";
import {
  getReleaseAssetNameForTarget,
  isLatestReleaseInstalled,
  isSourceWrapperScriptSnippet,
} from "./update.js";

test("getReleaseAssetNameForTarget maps supported platforms", () => {
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

test("isLatestReleaseInstalled compares tag names to the current version", () => {
  assert.equal(isLatestReleaseInstalled("v1.0.3", "1.0.3"), true);
  assert.equal(isLatestReleaseInstalled("1.0.3", "1.0.3"), true);
  assert.equal(isLatestReleaseInstalled("v1.0.4", "1.0.3"), false);
  assert.equal(isLatestReleaseInstalled(undefined, "1.0.3"), false);
});

test("isSourceWrapperScriptSnippet detects the local release wrapper", () => {
  const wrapper = [
    "#!/bin/sh",
    'export CRSR_INSTALL_PATH="/home/test/.local/bin/crsr"',
    'exec node "/workspace/dist/crsr.cjs" "$@"',
  ].join("\n");
  assert.equal(isSourceWrapperScriptSnippet(wrapper), true);
  assert.equal(isSourceWrapperScriptSnippet("#!/bin/sh\nexec /usr/bin/crsr \"$@\""), false);
});
