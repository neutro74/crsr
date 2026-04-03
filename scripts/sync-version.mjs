import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const packageJsonPath = path.join(repositoryRoot, "package.json");
const versionModulePath = path.join(repositoryRoot, "src", "version.ts");

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const version = typeof packageJson.version === "string" ? packageJson.version : null;

if (!version) {
  throw new Error(`Unable to determine package version from ${packageJsonPath}`);
}

const nextContent = `export const APP_NAME = "crsr";\nexport const APP_VERSION = "${version}";\n`;

try {
  const existingContent = readFileSync(versionModulePath, "utf8");
  if (existingContent === nextContent) {
    process.stdout.write(`Version module already up to date (${version}).\n`);
    process.exit(0);
  }
} catch {
  // Fall through and write the file.
}

writeFileSync(versionModulePath, nextContent, "utf8");
process.stdout.write(`Updated src/version.ts to ${version}.\n`);
