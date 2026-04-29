import { existsSync } from "node:fs";

const expectedArtifacts = [
  "release/crsr-linux-x64",
  "release/crsr-macos-x64",
  "release/crsr-macos-arm64",
  "release/crsr-win-x64.exe",
];

const missing = expectedArtifacts.filter((artifactPath) => !existsSync(artifactPath));

if (missing.length > 0) {
  throw new Error(
    `Missing expected release artifact(s): ${missing.join(", ")}.`,
  );
}

process.stdout.write(
  `Verified release artifacts: ${expectedArtifacts.join(", ")}\n`,
);
