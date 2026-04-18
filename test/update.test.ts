import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";
import {
  assertInstallPathIsUpdatable,
  fileLooksLikeWrapper,
  getReleaseAssetName,
  isWrapperPathFromEnvironment,
} from "../src/update.ts";

test("isWrapperPathFromEnvironment matches the configured install path", () => {
  const original = process.env.CRSR_INSTALL_PATH;
  process.env.CRSR_INSTALL_PATH = "/tmp/crsr";

  try {
    assert.equal(isWrapperPathFromEnvironment("/tmp/crsr"), true);
    assert.equal(isWrapperPathFromEnvironment("/tmp/other"), false);
  } finally {
    if (original === undefined) {
      delete process.env.CRSR_INSTALL_PATH;
    } else {
      process.env.CRSR_INSTALL_PATH = original;
    }
  }
});

test("fileLooksLikeWrapper detects the local source wrapper script", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "crsr-update-test-"));
  const wrapperPath = path.join(tempDir, "crsr");
  await writeFile(
    wrapperPath,
    '#!/bin/sh\nexport CRSR_INSTALL_PATH="/tmp/crsr"\nexec node "/repo/dist/crsr.cjs" "$@"\n',
    "utf8",
  );

  assert.equal(await fileLooksLikeWrapper(wrapperPath), true);
});

test("assertInstallPathIsUpdatable rejects local wrapper installs", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "crsr-update-test-"));
  const wrapperPath = path.join(tempDir, "crsr");
  await writeFile(
    wrapperPath,
    '#!/bin/sh\nexport CRSR_INSTALL_PATH="/tmp/crsr"\nexec node "/repo/dist/crsr.cjs" "$@"\n',
    "utf8",
  );

  await assert.rejects(
    () => assertInstallPathIsUpdatable(wrapperPath),
    /Refusing to replace the local source wrapper/,
  );
});

test("assertInstallPathIsUpdatable allows standalone binaries", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "crsr-update-test-"));
  const binaryPath = path.join(tempDir, "crsr");
  await writeFile(binaryPath, "fake-binary", "utf8");

  await assert.doesNotReject(() => assertInstallPathIsUpdatable(binaryPath));
});

test("getReleaseAssetName selects the native macOS arm64 asset", () => {
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
  const archDescriptor = Object.getOwnPropertyDescriptor(process, "arch");

  assert.ok(platformDescriptor);
  assert.ok(archDescriptor);

  Object.defineProperty(process, "platform", {
    configurable: true,
    value: "darwin",
  });
  Object.defineProperty(process, "arch", {
    configurable: true,
    value: "arm64",
  });

  try {
    assert.equal(getReleaseAssetName(), "crsr-macos-arm64");
  } finally {
    Object.defineProperty(process, "platform", platformDescriptor);
    Object.defineProperty(process, "arch", archDescriptor);
  }
});
