import { access } from "node:fs/promises";

const expectedArtifacts = [
  "release/crsr-linux-x64",
  "release/crsr-macos-x64",
  "release/crsr-macos-arm64",
  "release/crsr-win-x64.exe",
];

for (const artifact of expectedArtifacts) {
  try {
    await access(artifact);
  } catch {
    throw new Error(`Missing release artifact: ${artifact}`);
  }
}

process.stdout.write(
  `Verified release artifacts:\n${expectedArtifacts.map((artifact) => `- ${artifact}`).join("\n")}\n`,
);
