import { accessSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const releaseDirectory = path.join(repositoryRoot, "release");

const expectedAssets = [
  "crsr-linux-x64",
  "crsr-macos-x64",
  "crsr-macos-arm64",
  "crsr-win-x64.exe",
];

for (const assetName of expectedAssets) {
  const assetPath = path.join(releaseDirectory, assetName);
  accessSync(assetPath);
}

process.stdout.write(
  `Verified release assets: ${expectedAssets.join(", ")}\n`,
);
