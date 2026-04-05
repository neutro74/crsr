import os from "node:os";
import type { CommandRunResult } from "../runtime/cursorAgent.js";
import { renderGroupedHelp } from "../runtime/commandCatalog.js";
import type { SessionSnapshot } from "../session/sessionStore.js";

export function contractHome(p: string): string {
  const home = os.homedir();
  return p.startsWith(home) ? `~${p.slice(home.length)}` : p;
}

export function renderHelp(): string {
  return renderGroupedHelp();
}

export function renderHistory(snapshot: SessionSnapshot): string {
  if (snapshot.commandHistory.length === 0) {
    return "No slash commands or shell commands recorded yet.";
  }

  return snapshot.commandHistory
    .slice(0, 30)
    .map((entry, index) => `  ${String(index + 1).padStart(3)}  ${entry}`)
    .join("\n");
}

export function renderWorkspace(snapshot: SessionSnapshot): string {
  const active = snapshot.activeWorkspace
    ? contractHome(snapshot.activeWorkspace)
    : "(not set)";
  const lines = [`Active: ${active}`];

  if (snapshot.recentWorkspaces.length > 0) {
    lines.push("Recent (use /recent <n> to switch):");
    for (const [index, workspace] of snapshot.recentWorkspaces
      .slice(0, 10)
      .entries()) {
      lines.push(`  ${String(index + 1).padStart(2)}  ${contractHome(workspace)}`);
    }
  }

  return lines.join("\n");
}

export function renderRecent(snapshot: SessionSnapshot): string {
  if (snapshot.recentWorkspaces.length === 0) {
    return "No recent workspaces.";
  }

  return snapshot.recentWorkspaces
    .slice(0, 10)
    .map(
      (workspace, index) =>
        `  ${String(index + 1).padStart(2)}  ${contractHome(workspace)}`,
    )
    .join("\n");
}

export function renderConfig(snapshot: SessionSnapshot): string {
  const workspace = snapshot.activeWorkspace
    ? contractHome(snapshot.activeWorkspace)
    : "(home)";

  const lines = [
    `workspace    ${workspace}`,
    `model        ${snapshot.model ?? "(default)"}`,
    `mode         ${snapshot.mode}`,
    `force        ${snapshot.forceMode ? "on" : "off"}`,
    `sandbox      ${snapshot.sandbox ?? "off"}`,
    `approve-mcps ${snapshot.approveMcps ? "on" : "off"}`,
    `continue     ${snapshot.continueMode ? "on" : "off"}`,
    `resume       ${snapshot.resumeChatId ?? "(none)"}`,
    `api-key      ${snapshot.apiKey ? `${snapshot.apiKey.slice(0, 8)}… (session only)` : "(none)"}`,
  ];

  if (snapshot.customHeaders.length > 0) {
    lines.push(`headers      ${snapshot.customHeaders.length} set`);
    for (const [i, h] of snapshot.customHeaders.entries()) {
      lines.push(`  ${String(i + 1).padStart(2)}  ${h}`);
    }
  } else {
    lines.push("headers      (none)");
  }

  return lines.join("\n");
}

export function renderCommandResult(result: CommandRunResult): string {
  return result.exitCode === 0
    ? `done ${result.durationMs}ms`
    : `exit ${result.exitCode} (${result.durationMs}ms)`;
}
