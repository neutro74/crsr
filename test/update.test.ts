import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  getDownloadUrl,
  isWrapperInstallScript,
  verifyDigest,
} from "../src/update.js";

test("isWrapperInstallScript detects the local release wrapper", async () => {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "crsr-wrapper-test-"));
  const wrapperPath = path.join(tempDirectory, "crsr");

  try {
    await writeFile(
      wrapperPath,
      "#!/bin/sh\nexport CRSR_INSTALL_PATH=\"/tmp/crsr\"\nexec node \"/tmp/dist/crsr.cjs\" \"$@\"\n",
      "utf8",
    );

    assert.equal(await isWrapperInstallScript(wrapperPath), true);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test("getDownloadUrl requires browser_download_url metadata", () => {
  assert.throws(
    () => getDownloadUrl({ name: "crsr-linux-x64" }),
    /browser_download_url/,
  );
  assert.equal(
    getDownloadUrl({
      name: "crsr-linux-x64",
      browser_download_url: "https://example.com/crsr-linux-x64",
    }),
    "https://example.com/crsr-linux-x64",
  );
});

test("verifyDigest requires sha256 metadata and validates payloads", () => {
  const payload = Buffer.from("release-binary");
  const digest = createHash("sha256").update(payload).digest("hex");

  assert.throws(
    () => verifyDigest(payload, undefined, "crsr-linux-x64"),
    /missing a sha256 digest/,
  );

  assert.doesNotThrow(() =>
    verifyDigest(
      payload,
      `sha256:${digest}`,
      "crsr-linux-x64",
    ),
  );
});
