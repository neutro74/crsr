import { spawn } from "node:child_process";
import type { CommandRunResult, StreamEvent } from "./cursorAgent.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_CAPTURE_BYTES = 64 * 1024;
const LOGIN_SHELL_NAMES = new Set(["ash", "bash", "dash", "ksh", "mksh", "sh", "zsh"]);
const PLAIN_COMMAND_SHELL_NAMES = new Set(["fish", "nu", "nushell"]);

type StreamCallback = (event: StreamEvent) => void;
interface ShellExecutionPlan {
  shell: string;
  args: string[];
}
interface ShellExecutionOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}

function getChunkSize(chunks: string[]): number {
  return chunks.reduce((total, item) => total + item.length, 0);
}

function normalizeShellName(shell: string): string {
  const baseName = shell.split(/[\\/]/u).pop()?.toLowerCase() ?? shell.toLowerCase();
  return baseName.endsWith(".exe") ? baseName.slice(0, -4) : baseName;
}

function getPowerShellArgs(command: string): string[] {
  return ["-NoLogo", "-NoProfile", "-Command", command];
}

function getPosixShellArgs(shellName: string, command: string): string[] {
  if (LOGIN_SHELL_NAMES.has(shellName)) {
    return ["-lc", command];
  }

  if (PLAIN_COMMAND_SHELL_NAMES.has(shellName)) {
    return ["-c", command];
  }

  return ["-c", command];
}

export function getShellExecutionPlan(
  command: string,
  options: ShellExecutionOptions = {},
): ShellExecutionPlan {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const configuredShell = env.SHELL?.trim();

  if (platform === "win32") {
    const shell = configuredShell || env.COMSPEC?.trim() || "powershell.exe";
    const shellName = normalizeShellName(shell);

    if (shellName === "pwsh" || shellName === "powershell") {
      return { shell, args: getPowerShellArgs(command) };
    }

    if (shellName === "cmd") {
      return { shell, args: ["/d", "/s", "/c", command] };
    }

    return { shell, args: getPosixShellArgs(shellName, command) };
  }

  const shell = configuredShell || "bash";
  const shellName = normalizeShellName(shell);

  if (shellName === "pwsh" || shellName === "powershell") {
    return { shell, args: getPowerShellArgs(command) };
  }

  return { shell, args: getPosixShellArgs(shellName, command) };
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
  const shellPlan = getShellExecutionPlan(command);
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

    const child = spawn(shellPlan.shell, shellPlan.args, {
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
        args: [shellPlan.shell, ...shellPlan.args],
        exitCode: timedOut ? 124 : (code ?? 1),
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        durationMs: Date.now() - startTime,
      });
    });
  });
}
