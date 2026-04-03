import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

function quoteForShell(value) {
  return `"${value
    .replaceAll("\\", "\\\\")
    .replaceAll("\"", "\\\"")
    .replaceAll("$", "\\$")
    .replaceAll("`", "\\`")}"`;
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const bundlePath = path.join(repositoryRoot, "dist", "crsr.cjs");
const installDirectory = path.join(os.homedir(), ".local", "bin");
const wrapperPath = path.join(installDirectory, "crsr");

mkdirSync(installDirectory, { recursive: true });
writeFileSync(
  wrapperPath,
  `#!/bin/sh\nexport CRSR_INSTALL_PATH=${quoteForShell(wrapperPath)}\nexec node ${quoteForShell(bundlePath)} "$@"\n`,
  "utf8",
);
chmodSync(wrapperPath, 0o755);

process.stdout.write(`Installed wrapper at ${wrapperPath}\n`);
