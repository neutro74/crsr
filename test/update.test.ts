import test from "node:test";
import assert from "node:assert/strict";
import {
  getDownloadUrl,
  isCurrentVersionTag,
  verifyDigest,
} from "../src/update.js";

test("getDownloadUrl requires browser download URL", () => {
  assert.equal(
    getDownloadUrl({
      name: "crsr-linux-x64",
      browser_download_url: "https://example.com/crsr-linux-x64",
    }),
    "https://example.com/crsr-linux-x64",
  );

  assert.throws(
    () =>
      getDownloadUrl({
        name: "crsr-linux-x64",
        url: "https://api.github.com/repos/example/releases/assets/1",
      }),
    /does not include a browser_download_url/i,
  );
});

test("verifyDigest fails closed for missing or unsupported digests", () => {
  const data = Buffer.from("test-binary");

  assert.throws(
    () => verifyDigest("crsr-linux-x64", data, undefined),
    /missing a SHA-256 digest/i,
  );

  assert.throws(
    () => verifyDigest("crsr-linux-x64", data, "sha512:abc"),
    /unsupported digest format/i,
  );
});

test("verifyDigest accepts matching sha256 digests", () => {
  const data = Buffer.from("test-binary");
  verifyDigest(
    "crsr-linux-x64",
    data,
    "sha256:6a2f0f8c6b4f0ff37f61551e8f00a0636b4fa5242ac50336f9a7fb2b0e32ce89",
  );
});

test("verifyDigest rejects mismatched sha256 digests", () => {
  const data = Buffer.from("test-binary");

  assert.throws(
    () =>
      verifyDigest(
        "crsr-linux-x64",
        data,
        "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      ),
    /checksum mismatch/i,
  );
});

test("isCurrentVersionTag matches bare and v-prefixed versions", () => {
  assert.equal(isCurrentVersionTag("1.0.1"), true);
  assert.equal(isCurrentVersionTag("v1.0.1"), true);
  assert.equal(isCurrentVersionTag("v9.9.9"), false);
  assert.equal(isCurrentVersionTag(undefined), false);
});
