#!/usr/bin/env node
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const bundlePath = path.join(repositoryRoot, "dist", "crsr.cjs");
const binDirectory = path.join(os.homedir(), ".local", "bin");
const launcherPath = path.join(binDirectory, "crsr");

mkdirSync(binDirectory, { recursive: true });
writeFileSync(
  launcherPath,
  `#!/bin/sh
exec node "${bundlePath}" "$@"
`,
  "utf8",
);
chmodSync(launcherPath, 0o755);
console.log(`Installed local launcher at ${launcherPath}`);
