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

export interface ReleaseAsset {
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

export interface ResolvedReleaseAsset {
  name: string;
  browserDownloadUrl: string;
  digest: string;
}

/**
 * GitHub release asset filenames (see package scripts and README).
 */
export function getReleaseAssetNames(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string[] {
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

export function looksLikeLocalWrapperScript(contents: string): boolean {
  return (
    contents.includes("CRSR_INSTALL_PATH=") &&
    contents.includes("exec node ") &&
    contents.includes("dist/crsr.cjs")
  );
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

async function assertUpdatableInstallPath(installPath: string): Promise<void> {
  try {
    const contents = await readFile(installPath, "utf8");
    if (looksLikeLocalWrapperScript(contents)) {
      throw new Error(
        `Refusing to overwrite the local wrapper at ${installPath}. ` +
          "Rebuild from source with npm run release or set CRSR_INSTALL_PATH to a standalone binary path.",
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    if (error instanceof Error) {
      throw error;
    }
  }
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

export function resolveReleaseAsset(
  assets: ReleaseAsset[] | undefined,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): ResolvedReleaseAsset {
  const candidateNames = getReleaseAssetNames(platform, arch);
  for (const name of candidateNames) {
    const asset = assets?.find((candidate) => candidate.name === name);
    if (!asset) {
      continue;
    }

    if (!asset.browser_download_url) {
      throw new Error(
        `Release asset "${asset.name}" does not include a browser_download_url.`,
      );
    }

    if (!asset.digest?.startsWith("sha256:")) {
      throw new Error(
        `Release asset "${asset.name}" is missing a sha256 digest.`,
      );
    }

    return {
      name: asset.name,
      browserDownloadUrl: asset.browser_download_url,
      digest: asset.digest,
    };
  }

  throw new Error(
    `Latest release does not include any expected asset for this platform: ${candidateNames.join(", ")}.`,
  );
}

function verifyDigest(data: Buffer, digest: string): void {
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
  digest: string,
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
  await assertUpdatableInstallPath(installPath);

  process.stdout.write(`Checking the latest ${APP_NAME} release on GitHub...\n`);
  const release = await fetchLatestRelease();
  const releaseName = release.name ?? release.tag_name ?? "latest release";
  let asset: ResolvedReleaseAsset;
  try {
    asset = resolveReleaseAsset(release.assets);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Latest release "${releaseName}" is not suitable for self-update. ${message}`);
  }

  process.stdout.write(
    `Downloading ${asset.name} from ${releaseName} and replacing ${installPath}...\n`,
  );
  await replaceInstalledBinary(
    installPath,
    asset.name,
    asset.browserDownloadUrl,
    asset.digest,
  );
  process.stdout.write(
    `${APP_NAME} updated successfully at ${installPath}. Restart the command to use the new binary.\n`,
  );
}
