import assert from "node:assert/strict";
import test from "node:test";
import {
  isSameReleaseVersion,
  isSourceInstallWrapper,
} from "../src/update.js";

test("isSourceInstallWrapper detects the local source wrapper", () => {
  const wrapper = `#!/bin/sh
export CRSR_INSTALL_PATH="/home/test/.local/bin/crsr"
exec node "/workspace/dist/crsr.cjs" "$@"
`;

  assert.equal(isSourceInstallWrapper(wrapper), true);
});

test("isSourceInstallWrapper ignores unrelated shell scripts", () => {
  const script = `#!/bin/sh
echo "hello"
`;

  assert.equal(isSourceInstallWrapper(script), false);
});

test("isSameReleaseVersion ignores a leading v prefix", () => {
  assert.equal(isSameReleaseVersion("v1.0.2", "1.0.2"), true);
  assert.equal(isSameReleaseVersion("1.0.3", "1.0.2"), false);
});
