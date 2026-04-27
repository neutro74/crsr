import { access } from "node:fs/promises";
import path from "node:path";

const releaseDirectory = path.resolve("release");
const expectedArtifacts = [
  "crsr-linux-x64",
  "crsr-macos-x64",
  "crsr-macos-arm64",
  "crsr-win-x64.exe",
];

for (const artifact of expectedArtifacts) {
  const artifactPath = path.join(releaseDirectory, artifact);
  try {
    await access(artifactPath);
  } catch {
    throw new Error(`Missing release artifact: ${artifactPath}`);
  }
}

process.stdout.write(
  `Verified release artifacts: ${expectedArtifacts.join(", ")}\n`,
);
