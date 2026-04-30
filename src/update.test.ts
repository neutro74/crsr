import test from "node:test";
import assert from "node:assert/strict";
import {
  getReleaseAssetNameForTarget,
  isNodeWrapperScript,
} from "./update.js";

test("getReleaseAssetNameForTarget selects the arm64 macOS binary", () => {
  assert.equal(getReleaseAssetNameForTarget("darwin", "arm64"), "crsr-macos-arm64");
});

test("getReleaseAssetNameForTarget rejects unsupported platforms", () => {
  assert.throws(
    () => getReleaseAssetNameForTarget("linux", "arm64"),
    /No GitHub release binary/,
  );
});

test("isNodeWrapperScript detects the local wrapper install", () => {
  const wrapper = `#!/bin/sh
export CRSR_INSTALL_PATH="/home/test/.local/bin/crsr"
exec node "/workspace/dist/crsr.cjs" "$@"
`;

  assert.equal(isNodeWrapperScript(wrapper), true);
  assert.equal(isNodeWrapperScript("#!/bin/sh\nexec /tmp/crsr \"$@\"\n"), false);
});
