import { existsSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const releaseDirectory = path.join(repositoryRoot, "release");

function renameIfPresent(fromName, toName) {
  const fromPath = path.join(releaseDirectory, fromName);
  if (!existsSync(fromPath) || fromName === toName) {
    return false;
  }

  const toPath = path.join(releaseDirectory, toName);
  rmSync(toPath, { force: true });
  renameSync(fromPath, toPath);
  return true;
}

renameIfPresent("crsr-linux", "crsr-linux-x64");
renameIfPresent("crsr-win.exe", "crsr-win-x64.exe");

if (!renameIfPresent("crsr-macos", "crsr-macos-x64")) {
  renameIfPresent("crsr-x64", "crsr-macos-x64");
}

if (!renameIfPresent("crsr-macos-arm64", "crsr-macos-arm64")) {
  renameIfPresent("crsr-arm64", "crsr-macos-arm64");
}
