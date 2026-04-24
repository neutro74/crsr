import { access } from "node:fs/promises";

const expectedArtifacts = [
  "release/crsr-linux-x64",
  "release/crsr-macos-x64",
  "release/crsr-macos-arm64",
  "release/crsr-win-x64.exe",
];

const missingArtifacts = [];
for (const artifact of expectedArtifacts) {
  try {
    await access(new URL(`../${artifact}`, import.meta.url));
  } catch {
    missingArtifacts.push(artifact);
  }
}

if (missingArtifacts.length > 0) {
  throw new Error(
    `Missing release artifacts: ${missingArtifacts.join(", ")}`,
  );
}

process.stdout.write(
  `Verified release artifacts: ${expectedArtifacts.join(", ")}\n`,
);
