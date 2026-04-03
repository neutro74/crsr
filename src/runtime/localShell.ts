import { spawn } from "node:child_process";
import os from "node:os";
import type { CommandRunResult, StreamEvent } from "./cursorAgent.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_CAPTURE_BYTES = 64 * 1024;

type StreamCallback = (event: StreamEvent) => void;

function appendWithLimit(chunks: string[], chunk: string): void {
  const currentSize = chunks.reduce((total, item) => total + item.length, 0);
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
  const shell = process.env.SHELL || (process.platform === "win32" ? "powershell" : "bash");
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

    const child = spawn(shell, ["-lc", command], {
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
      const before = stdoutChunks.reduce((total, item) => total + item.length, 0);
      appendWithLimit(stdoutChunks, text);
      if (!stdoutTruncated && before + text.length > MAX_CAPTURE_BYTES) {
        stdoutTruncated = true;
      }
      onEvent({ type: "stdout", text });
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      const before = stderrChunks.reduce((total, item) => total + item.length, 0);
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
        args: [shell, "-lc", command],
        exitCode: timedOut ? 124 : (code ?? 1),
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        durationMs: Date.now() - startTime,
      });
    });
  });
}
