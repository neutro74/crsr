import { access, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const releaseDirectory = path.join(repositoryRoot, "release");

async function renameIfPresent(sourceName, targetName) {
  const sourcePath = path.join(releaseDirectory, sourceName);
  const targetPath = path.join(releaseDirectory, targetName);

  if (sourcePath === targetPath) {
    return;
  }

  try {
    await access(sourcePath);
  } catch {
    return;
  }

  await rm(targetPath, { force: true });
  await rename(sourcePath, targetPath);
  process.stdout.write(`Renamed ${sourceName} -> ${targetName}\n`);
}

await renameIfPresent("crsr-x64", "crsr-macos-x64");
await renameIfPresent("crsr-arm64", "crsr-macos-arm64");
