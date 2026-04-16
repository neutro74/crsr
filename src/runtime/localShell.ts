import { spawn } from "node:child_process";
import path from "node:path";
import type { CommandRunResult, StreamEvent } from "./cursorAgent.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_CAPTURE_BYTES = 64 * 1024;

type StreamCallback = (event: StreamEvent) => void;

interface ShellLaunch {
  shell: string;
  args: string[];
}

function getChunkSize(chunks: string[]): number {
  return chunks.reduce((total, item) => total + item.length, 0);
}

function getShellBasename(shell: string): string {
  return path.basename(shell).toLowerCase();
}

export function buildShellLaunch(
  command: string,
  platform: NodeJS.Platform = process.platform,
  configuredShell?: string,
  windowsCommandShell?: string,
): ShellLaunch {
  if (platform === "win32") {
    const preferredShell =
      configuredShell?.trim() ||
      process.env.ComSpec?.trim() ||
      "powershell.exe";
    const shellName = getShellBasename(preferredShell);

    if (
      shellName === "bash" ||
      shellName === "zsh" ||
      shellName === "sh" ||
      shellName === "fish"
    ) {
      return {
        shell: preferredShell,
        args: shellName === "fish" ? ["-c", command] : ["-lc", command],
      };
    }

    if (shellName === "pwsh" || shellName === "pwsh.exe") {
      return { shell: preferredShell, args: ["-NoProfile", "-Command", command] };
    }

    if (shellName === "powershell" || shellName === "powershell.exe") {
      return { shell: preferredShell, args: ["-NoProfile", "-Command", command] };
    }

    const commandShell = windowsCommandShell?.trim() || preferredShell;
    return { shell: commandShell, args: ["/d", "/s", "/c", command] };
  }

  const shell = configuredShell?.trim() || process.env.SHELL || "bash";
  const shellName = getShellBasename(shell);

  if (shellName === "fish" || shellName === "nu" || shellName === "nushell") {
    return { shell, args: ["-c", command] };
  }

  if (shellName === "csh" || shellName === "tcsh") {
    return { shell, args: ["-fc", command] };
  }

  return { shell, args: ["-lc", command] };
}

function appendWithLimit(chunks: string[], chunk: string): void {
  const currentSize = getChunkSize(chunks);
  if (currentSize >= MAX_CAPTURE_BYTES) {
    return;
  }

  const remaining = MAX_CAPTURE_BYTES - currentSize;
  chunks.push(chunk.slice(0, remaining));
}

export async function runLocalShellCommand(
  command: string,
  cwd: string,
  onEvent: StreamCallback,
): Promise<CommandRunResult> {
  const launch = buildShellLaunch(
    command,
    process.platform,
    process.env.SHELL,
    process.env.ComSpec,
  );
  const startTime = Date.now();
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  onEvent({
    type: "status",
    message: `$ ${command}`,
  });

  return await new Promise<CommandRunResult>((resolve, reject) => {
    let timedOut = false;
    let stdoutTruncated = false;
    let stderrTruncated = false;

    const child = spawn(launch.shell, launch.args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, DEFAULT_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      const before = getChunkSize(stdoutChunks);
      appendWithLimit(stdoutChunks, text);
      if (!stdoutTruncated && before + text.length > MAX_CAPTURE_BYTES) {
        stdoutTruncated = true;
      }
      onEvent({ type: "stdout", text });
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      const before = getChunkSize(stderrChunks);
      appendWithLimit(stderrChunks, text);
      if (!stderrTruncated && before + text.length > MAX_CAPTURE_BYTES) {
        stderrTruncated = true;
      }
      onEvent({ type: "stderr", text });
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);

      if (timedOut) {
        onEvent({
          type: "stderr",
          text: `Command timed out after ${DEFAULT_TIMEOUT_MS / 1000}s.`,
        });
      }

      if (stdoutTruncated) {
        onEvent({
          type: "stderr",
          text: `stdout was truncated after ${MAX_CAPTURE_BYTES} bytes.`,
        });
      }

      if (stderrTruncated) {
        onEvent({
          type: "stderr",
          text: `stderr was truncated after ${MAX_CAPTURE_BYTES} bytes.`,
        });
      }

      resolve({
        args: [launch.shell, ...launch.args],
        exitCode: timedOut ? 124 : (code ?? 1),
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        durationMs: Date.now() - startTime,
      });
    });
  });
}
