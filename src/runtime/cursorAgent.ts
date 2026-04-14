import { spawn } from "node:child_process";
import { constants, existsSync } from "node:fs";
import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ShellConfig } from "../config/config.js";
import type { SessionSnapshot } from "../session/sessionStore.js";

export interface CommandRunOptions {
  args: string[];
  workspace?: string | null;
  cwd?: string;
  parseStreamJson?: boolean;
  inheritStdio?: boolean;
}

export interface CommandRunResult {
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export type StreamEvent =
  | { type: "status"; message: string }
  | { type: "stdout"; text: string }
  | { type: "stderr"; text: string }
  | { type: "partial"; text: string }
  | { type: "thinking"; text: string }
  | { type: "thinking-complete" }
  | {
      type: "subagent";
      phase: "started" | "completed";
      description: string;
      summary?: string;
    }
  | { type: "json"; payload: unknown };

type StreamCallback = (event: StreamEvent) => void;

function quoteForStatus(value: string): string {
  if (value.length === 0) {
    return '""';
  }

  return /\s|["'`$\\]/u.test(value)
    ? JSON.stringify(value)
    : value;
}

function redactArgsForStatus(args: string[]): string[] {
  const redacted: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;

    if (token === "--api-key" || token === "--header") {
      redacted.push(token);
      if (index + 1 < args.length) {
        redacted.push("[REDACTED]");
        index += 1;
      }
      continue;
    }

    redacted.push(token);
  }

  return redacted;
}

function getCandidateBinaries(config: ShellConfig): string[] {
  const candidates = [
    config.binaryPath,
    process.env.CURSOR_AGENT_BINARY,
    path.join(os.homedir(), ".local", "bin", "cursor-agent"),
    "cursor-agent",
  ];

  return candidates.filter(
    (candidate): candidate is string => Boolean(candidate),
  );
}

async function isExecutable(filePath: string): Promise<boolean> {
  if (filePath === "cursor-agent") {
    return true;
  }

  if (!existsSync(filePath)) {
    return false;
  }

  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function extractPartialText(payload: unknown): string | null {
  if (typeof payload === "string") {
    return payload;
  }

  if (Array.isArray(payload)) {
    const parts = payload
      .map((item) => extractPartialText(item))
      .filter((item): item is string => typeof item === "string" && item.length > 0);
    return parts.length > 0 ? parts.join("") : null;
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  for (const key of ["delta", "text", "message", "content"]) {
    const value = candidate[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }

    const nestedValue = extractPartialText(value);
    if (nestedValue) {
      return nestedValue;
    }
  }

  for (const nested of [candidate.data, candidate.payload, candidate.message]) {
    const nestedText = extractPartialText(nested);
    if (nestedText) {
      return nestedText;
    }
  }

  return null;
}

function createLineDecoder(
  onLine: (line: string) => void,
): { push(chunk: string): void; flush(): void } {
  let buffer = "";

  return {
    push(chunk: string): void {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        onLine(line);
      }
    },
    flush(): void {
      if (buffer.length > 0) {
        onLine(buffer);
        buffer = "";
      }
    },
  };
}

function extractSubagentDescription(payload: Record<string, unknown>): string | null {
  const toolCall = payload.tool_call;
  if (!toolCall || typeof toolCall !== "object") {
    return null;
  }

  const taskToolCall = (toolCall as Record<string, unknown>).taskToolCall;
  if (!taskToolCall || typeof taskToolCall !== "object") {
    return null;
  }

  const args = (taskToolCall as Record<string, unknown>).args;
  if (!args || typeof args !== "object") {
    return "Subagent";
  }

  const candidate = args as Record<string, unknown>;
  if (typeof candidate.description === "string" && candidate.description.trim().length > 0) {
    return candidate.description.trim();
  }

  if (typeof candidate.prompt === "string" && candidate.prompt.trim().length > 0) {
    return candidate.prompt.trim();
  }

  return "Subagent";
}

function extractSubagentSummary(payload: Record<string, unknown>): string | null {
  const toolCall = payload.tool_call;
  if (!toolCall || typeof toolCall !== "object") {
    return null;
  }

  const taskToolCall = (toolCall as Record<string, unknown>).taskToolCall;
  if (!taskToolCall || typeof taskToolCall !== "object") {
    return null;
  }

  const result = (taskToolCall as Record<string, unknown>).result;
  if (!result || typeof result !== "object") {
    return null;
  }

  const success = (result as Record<string, unknown>).success;
  if (!success || typeof success !== "object") {
    return null;
  }

  const conversationSteps = (success as Record<string, unknown>).conversationSteps;
  if (!Array.isArray(conversationSteps)) {
    return null;
  }

  for (let index = conversationSteps.length - 1; index >= 0; index -= 1) {
    const step = conversationSteps[index];
    if (!step || typeof step !== "object") {
      continue;
    }

    const assistantMessage = (step as Record<string, unknown>).assistantMessage;
    if (!assistantMessage || typeof assistantMessage !== "object") {
      continue;
    }

    const text = (assistantMessage as Record<string, unknown>).text;
    if (typeof text === "string" && text.trim().length > 0) {
      return text.trim();
    }
  }

  return null;
}

export class CursorAgentAdapter {
  public constructor(private readonly config: ShellConfig) {}

  public async resolveBinaryPath(): Promise<string> {
    return this.resolveBinary();
  }

  public buildPromptArgs(
    prompt: string,
    session: SessionSnapshot,
  ): string[] {
    const args = ["--print", "--output-format", "stream-json"];
    if (this.config.trustPrintMode) {
      args.push("--trust");
    }
    args.push("--stream-partial-output");

    if (session.model) {
      args.push("--model", session.model);
    }

    if (session.mode === "plan") {
      args.push("--mode", "plan");
    } else if (session.mode === "ask") {
      args.push("--mode", "ask");
    }

    if (session.forceMode) {
      args.push("--force");
    }

    if (session.sandbox) {
      args.push("--sandbox", session.sandbox);
    }

    if (session.approveMcps) {
      args.push("--approve-mcps");
    }

    if (session.continueMode) {
      args.push("--continue");
    }

    if (session.resumeChatId) {
      args.push("--resume", session.resumeChatId);
    }

    const apiKey = session.apiKey ?? this.config.apiKey;
    if (apiKey) {
      args.push("--api-key", apiKey);
    }

    const headers = [
      ...this.config.defaultHeaders,
      ...session.customHeaders,
    ];
    for (const header of headers) {
      args.push("--header", header);
    }

    args.push(prompt);
    return args;
  }

  public async runPrompt(
    prompt: string,
    session: SessionSnapshot,
    onEvent: StreamCallback,
  ): Promise<CommandRunResult> {
    return this.runCommand(
      {
        args: this.buildPromptArgs(prompt, session),
        workspace: session.activeWorkspace,
        parseStreamJson: true,
      },
      onEvent,
    );
  }

  public async runCommand(
    options: CommandRunOptions,
    onEvent: StreamCallback,
  ): Promise<CommandRunResult> {
    const binary = await this.resolveBinary();
    const startTime = Date.now();
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    const finalArgs = [
      ...this.buildGlobalArgs(options.workspace),
      ...options.args,
    ];
    onEvent({
      type: "status",
      message: `$ cursor-agent ${redactArgsForStatus(finalArgs).map(quoteForStatus).join(" ")}`,
    });

    return await new Promise<CommandRunResult>((resolve, reject) => {
      let assistantBuffer = "";
      let emittedAssistantText = false;
      let finalResultText: string | null = null;
      const decodeJsonLine = createLineDecoder((line) => {
        if (line.trim().length === 0) {
          return;
        }

        try {
          const payload = JSON.parse(line) as unknown;
          onEvent({ type: "json", payload });
          if (payload && typeof payload === "object" && !Array.isArray(payload)) {
            const candidate = payload as Record<string, unknown>;
            if (
              candidate.type === "result" &&
              candidate.subtype === "success" &&
              typeof candidate.result === "string"
            ) {
              finalResultText = candidate.result;
            }

            if (candidate.type === "assistant") {
              const nextText = extractPartialText(payload);
              if (nextText) {
                if (nextText.startsWith(assistantBuffer)) {
                  const delta = nextText.slice(assistantBuffer.length);
                  assistantBuffer = nextText;
                  if (delta.length > 0) {
                    emittedAssistantText = true;
                    onEvent({ type: "partial", text: delta });
                  }
                } else {
                  assistantBuffer += nextText;
                  emittedAssistantText = true;
                  onEvent({ type: "partial", text: nextText });
                }
              }
            }

            if (
              candidate.type === "thinking" &&
              candidate.subtype === "delta" &&
              typeof candidate.text === "string" &&
              candidate.text.length > 0
            ) {
              onEvent({ type: "thinking", text: candidate.text });
            }

            if (candidate.type === "thinking" && candidate.subtype === "completed") {
              onEvent({ type: "thinking-complete" });
            }

            if (candidate.type === "tool_call") {
              const description = extractSubagentDescription(candidate);
              if (description) {
                if (candidate.subtype === "started") {
                  onEvent({
                    type: "subagent",
                    phase: "started",
                    description,
                  });
                } else if (candidate.subtype === "completed") {
                  onEvent({
                    type: "subagent",
                    phase: "completed",
                    description,
                    summary: extractSubagentSummary(candidate) ?? undefined,
                  });
                }
              }
            }
          }
        } catch {
          onEvent({ type: "stdout", text: line });
        }
      });

      const child = spawn(binary, finalArgs, {
        cwd: options.cwd ?? options.workspace ?? process.cwd(),
        env: process.env,
        stdio: options.inheritStdio
          ? ["inherit", "inherit", "inherit"]
          : ["ignore", "pipe", "pipe"],
      });

      if (!options.inheritStdio) {
        child.stdout!.on("data", (chunk: Buffer | string) => {
          const text = chunk.toString();
          stdoutChunks.push(text);
          if (options.parseStreamJson) {
            decodeJsonLine.push(text);
            return;
          }
          onEvent({ type: "stdout", text });
        });

        child.stderr!.on("data", (chunk: Buffer | string) => {
          const text = chunk.toString();
          stderrChunks.push(text);
          onEvent({ type: "stderr", text });
        });
      }

      child.on("error", (error) => {
        reject(error);
      });

      child.on("close", (code) => {
        if (options.parseStreamJson && !options.inheritStdio) {
          decodeJsonLine.flush();
        }

        if (
          options.parseStreamJson &&
          !emittedAssistantText &&
          finalResultText &&
          finalResultText.length > 0
        ) {
          onEvent({ type: "partial", text: finalResultText });
        }

        resolve({
          args: finalArgs,
          exitCode: code ?? 1,
          stdout: stdoutChunks.join(""),
          stderr: stderrChunks.join(""),
          durationMs: Date.now() - startTime,
        });
      });
    });
  }

  private buildGlobalArgs(
    workspace: string | null | undefined,
  ): string[] {
    if (!workspace) {
      return [];
    }

    return ["--workspace", workspace];
  }

  private async resolveBinary(): Promise<string> {
    for (const candidate of getCandidateBinaries(this.config)) {
      if (await isExecutable(candidate)) {
        return candidate;
      }
    }

    const candidates = getCandidateBinaries(this.config).join(", ");
    throw new Error(
      `Unable to locate a usable cursor-agent binary. Checked: ${candidates}`,
    );
  }
}
