import { createHash } from "node:crypto";
import { access, chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
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

function normalizeReleaseTag(tag: string | undefined): string | null {
  if (!tag) {
    return null;
  }

  const normalized = tag.trim().replace(/^v/u, "");
  return normalized.length > 0 ? normalized : null;
}

function parseReleaseVersion(tag: string | undefined): number[] | null {
  const normalized = normalizeReleaseTag(tag);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:[.-].*)?$/u);
  if (!match) {
    return null;
  }

  return match.slice(1, 4).map((segment) => Number.parseInt(segment, 10));
}

function compareReleaseVersions(current: string, published: string | undefined): number | null {
  const currentVersion = parseReleaseVersion(current);
  const publishedVersion = parseReleaseVersion(published);
  if (!currentVersion || !publishedVersion) {
    return null;
  }

  for (let index = 0; index < currentVersion.length; index += 1) {
    const delta = currentVersion[index]! - publishedVersion[index]!;
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

function getCompatibleReleaseAssetNames(): string[] {
  const { platform, arch } = process;

  if (platform === "linux" && arch === "x64") {
    return ["crsr-linux-x64"];
  }

  if (platform === "darwin" && arch === "x64") {
    return ["crsr-macos-x64"];
  }

  if (platform === "darwin" && arch === "arm64") {
    return ["crsr-macos-arm64", "crsr-macos-x64"];
  }

  if (platform === "win32" && arch === "x64") {
    return ["crsr-win-x64.exe"];
  }

  throw new Error(
    `No GitHub release binary for this platform (${platform}-${arch}). ` +
      "Supported: linux-x64, darwin-x64, darwin-arm64, win32-x64.",
  );
}

/**
 * GitHub release asset filenames (see `npm run package:linux` / multi-target `pkg` in README).
 */
export function getReleaseAssetName(): string {
  return getCompatibleReleaseAssetNames()[0]!;
}

async function resolveInstallPath(): Promise<string> {
  const packagedProcess = process as ProcessWithPkg;
  if (packagedProcess.pkg) {
    return process.execPath;
  }

  const wrapperPath = process.env.CRSR_INSTALL_PATH?.trim();
  if (wrapperPath) {
    return wrapperPath;
  }

  await access(DEFAULT_INSTALL_PATH);
  return DEFAULT_INSTALL_PATH;
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

function getDownloadUrl(asset: ReleaseAsset): string {
  if (asset.browser_download_url) {
    return asset.browser_download_url;
  }

  if (asset.url) {
    return asset.url;
  }

  throw new Error(`Release asset "${asset.name}" does not include a download URL.`);
}

function verifyDigest(data: Buffer, digest: string | undefined): void {
  if (!digest?.startsWith("sha256:")) {
    return;
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
    verifyDigest(binaryData, digest);
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
  const installPath = await resolveInstallPath().catch(() => {
    throw new Error(
      `Unable to determine which ${APP_NAME} executable to replace. Run the local wrapper install first or use the standalone GitHub release binary.`,
    );
  });
  const assetCandidates = getCompatibleReleaseAssetNames();

  process.stdout.write(`Checking the latest ${APP_NAME} release on GitHub...\n`);
  const release = await fetchLatestRelease();
  const releaseName = release.name ?? release.tag_name ?? "latest release";
  const versionComparison = compareReleaseVersions(APP_VERSION, release.tag_name);

  if (versionComparison === 0) {
    process.stdout.write(
      `${APP_NAME} ${APP_VERSION} is already up to date. No download needed.\n`,
    );
    return;
  }

  if (versionComparison !== null && versionComparison > 0) {
    const publishedVersion = normalizeReleaseTag(release.tag_name) ?? releaseName;
    process.stdout.write(
      `${APP_NAME} ${APP_VERSION} is newer than the latest published release (${publishedVersion}). Skipping update.\n`,
    );
    return;
  }

  const asset = release.assets?.find((candidate) =>
    assetCandidates.includes(candidate.name),
  );

  if (!asset) {
    throw new Error(
      `Latest release "${releaseName}" does not include a compatible asset (${assetCandidates.join(", ")}).`,
    );
  }

  process.stdout.write(
    `Downloading ${asset.name} from ${releaseName} and replacing ${installPath}...\n`,
  );
  await replaceInstalledBinary(
    installPath,
    asset.name,
    getDownloadUrl(asset),
    asset.digest,
  );
  process.stdout.write(
    `${APP_NAME} updated successfully at ${installPath}. Restart the command to use the new binary.\n`,
  );
}
