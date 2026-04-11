import { createHash } from "node:crypto";
import {
  access,
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { APP_NAME, APP_VERSION } from "./version.js";

const RELEASE_REPOSITORY = "neutro74/crsr";
const RELEASE_API_URL = `https://api.github.com/repos/${RELEASE_REPOSITORY}/releases/latest`;
const DEFAULT_INSTALL_PATH = path.join(os.homedir(), ".local", "bin", APP_NAME);
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

interface ReleaseAsset {
  name: string;
  browser_download_url?: string;
  url?: string;
  digest?: string;
}

interface LatestReleaseResponse {
  tag_name?: string;
  name?: string;
  assets?: ReleaseAsset[];
}

interface ProcessWithPkg extends NodeJS.Process {
  pkg?: unknown;
}

interface InstallTarget {
  path: string;
  source: "packaged" | "env" | "default";
}

/**
 * GitHub release asset filenames (see `npm run package:linux` / multi-target `pkg` in README).
 */
export function getReleaseAssetName(): string {
  const { platform, arch } = process;

  if (platform === "linux" && arch === "x64") {
    return "crsr-linux-x64";
  }

  if (platform === "darwin" && (arch === "x64" || arch === "arm64")) {
    // Single macOS build is x64; Apple Silicon runs it under Rosetta when needed.
    return "crsr-macos-x64";
  }

  if (platform === "win32" && arch === "x64") {
    return "crsr-win-x64.exe";
  }

  throw new Error(
    `No GitHub release binary for this platform (${platform}-${arch}). ` +
      "Supported: linux-x64, darwin-x64|arm64, win32-x64.",
  );
}

export async function resolveInstallTarget(): Promise<InstallTarget> {
  const packagedProcess = process as ProcessWithPkg;
  if (packagedProcess.pkg) {
    return { path: process.execPath, source: "packaged" };
  }

  const wrapperPath = process.env.CRSR_INSTALL_PATH?.trim();
  if (wrapperPath) {
    return { path: wrapperPath, source: "env" };
  }

  await access(DEFAULT_INSTALL_PATH);
  return { path: DEFAULT_INSTALL_PATH, source: "default" };
}

async function fetchLatestRelease(): Promise<LatestReleaseResponse> {
  const response = await fetch(RELEASE_API_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": `${APP_NAME}/${APP_VERSION}`,
    },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Unable to fetch the latest GitHub release (${response.status} ${response.statusText}). ${body}`.trim(),
    );
  }

  return (await response.json()) as LatestReleaseResponse;
}

export async function isWrapperInstallScript(targetPath: string): Promise<boolean> {
  try {
    const content = await readFile(targetPath, "utf8");
    return (
      content.startsWith("#!") &&
      content.includes("CRSR_INSTALL_PATH=") &&
      content.includes("exec node ")
    );
  } catch {
    return false;
  }
}

export function getDownloadUrl(asset: ReleaseAsset): string {
  if (!asset.browser_download_url) {
    throw new Error(
      `Release asset "${asset.name}" does not include browser_download_url metadata.`,
    );
  }

  return asset.browser_download_url;
}

export function verifyDigest(
  data: Buffer,
  digest: string | undefined,
  assetName: string,
): void {
  if (!digest?.startsWith("sha256:")) {
    throw new Error(
      `Release asset "${assetName}" is missing a sha256 digest and cannot be verified.`,
    );
  }

  const expectedDigest = digest.slice("sha256:".length).toLowerCase();
  const actualDigest = createHash("sha256").update(data).digest("hex");

  if (actualDigest !== expectedDigest) {
    throw new Error(
      `Downloaded binary checksum mismatch. Expected ${expectedDigest}, received ${actualDigest}.`,
    );
  }
}

async function replaceInstalledBinary(
  targetPath: string,
  assetName: string,
  downloadUrl: string,
  digest: string | undefined,
): Promise<void> {
  const parentDirectory = path.dirname(targetPath);
  const isWindows = process.platform === "win32";
  const safeBase = assetName.replace(/\.exe$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const tempSuffix = isWindows ? ".exe" : "";
  const temporaryPath = path.join(
    parentDirectory,
    `.${safeBase}.download-${process.pid}-${Date.now()}${tempSuffix}`,
  );

  await mkdir(parentDirectory, { recursive: true });

  try {
    const response = await fetch(downloadUrl, {
      headers: {
        Accept: "application/octet-stream",
        "User-Agent": `${APP_NAME}/${APP_VERSION}`,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Unable to download ${assetName} (${response.status} ${response.statusText}). ${body}`.trim(),
      );
    }

    const binaryData = Buffer.from(await response.arrayBuffer());
    verifyDigest(binaryData, digest, assetName);
    await writeFile(temporaryPath, binaryData, {
      mode: isWindows ? 0o666 : 0o755,
    });
    if (!isWindows) {
      await chmod(temporaryPath, 0o755);
    }
    await rename(temporaryPath, targetPath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

export async function runSelfUpdate(): Promise<void> {
  const installTarget = await resolveInstallTarget().catch(() => {
    throw new Error(
      `Unable to determine which ${APP_NAME} executable to replace. Run the local wrapper install first or use the standalone GitHub release binary.`,
    );
  });
  if (
    installTarget.source !== "packaged" &&
    (await isWrapperInstallScript(installTarget.path))
  ) {
    throw new Error(
      `Refusing to overwrite wrapper install at ${installTarget.path}. Rebuild from source with "npm run release" or point CRSR_INSTALL_PATH at a standalone binary path.`,
    );
  }
  const assetName = getReleaseAssetName();

  process.stdout.write(`Checking the latest ${APP_NAME} release on GitHub...\n`);
  const release = await fetchLatestRelease();
  const releaseName = release.name ?? release.tag_name ?? "latest release";
  const asset = release.assets?.find((candidate) => candidate.name === assetName);

  if (!asset) {
    throw new Error(
      `Latest release "${releaseName}" does not include the expected asset "${assetName}".`,
    );
  }

  process.stdout.write(
    `Downloading ${asset.name} from ${releaseName} and replacing ${installTarget.path}...\n`,
  );
  await replaceInstalledBinary(
    installTarget.path,
    asset.name,
    getDownloadUrl(asset),
    asset.digest,
  );
  process.stdout.write(
    `${APP_NAME} updated successfully at ${installTarget.path}. Restart the command to use the new binary.\n`,
  );
}
