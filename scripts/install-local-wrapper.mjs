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
const sourceWrapperMarker = "# crsr-source-wrapper";

if (process.platform === "win32") {
  process.stderr.write(
    'npm run release installs a POSIX shell wrapper and is not supported on native Windows.\n' +
      "Use npm run build with node dist/crsr.cjs, use WSL, or download the standalone GitHub release binary instead.\n",
  );
  process.exit(1);
}

mkdirSync(installDirectory, { recursive: true });
writeFileSync(
  wrapperPath,
  `#!/bin/sh\n${sourceWrapperMarker}\nexport CRSR_INSTALL_PATH=${quoteForShell(wrapperPath)}\nexec node ${quoteForShell(bundlePath)} "$@"\n`,
  "utf8",
);
chmodSync(wrapperPath, 0o755);

process.stdout.write(`Installed wrapper at ${wrapperPath}\n`);
