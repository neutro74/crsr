import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ShellPaths } from "../config/config.js";

interface PersistedSessionState {
  commandHistory: string[];
  recentWorkspaces: string[];
  activeWorkspace: string | null;
  model: string | null;
  mode: "normal" | "plan" | "ask";
  forceMode: boolean;
  sandbox: "enabled" | "disabled" | null;
  approveMcps: boolean;
  customHeaders: string[];
  theme: string;
  vimMode: boolean;
}

interface TransientState {
  apiKey: string | null;
  continueMode: boolean;
  resumeChatId: string | null;
}

export interface SessionSnapshot extends PersistedSessionState, TransientState {}
export interface SessionDefaults {
  model?: string;
  mode?: "normal" | "plan" | "ask";
  forceMode?: boolean;
  sandbox?: "enabled" | "disabled" | null;
  approveMcps?: boolean;
}

const DEFAULT_STATE: PersistedSessionState = {
  commandHistory: [],
  recentWorkspaces: [],
  activeWorkspace: null,
  model: null,
  mode: "normal",
  forceMode: false,
  sandbox: null,
  approveMcps: false,
  customHeaders: [],
  theme: "dark",
  vimMode: false,
};

const MAX_HISTORY_ITEMS = 200;
const MAX_RECENT_WORKSPACES = 20;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeWorkspace(workspace: string): string {
  return path.resolve(workspace.trim());
}

function normalizeWorkspaceList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: string[] = [];
  for (const entry of value) {
    if (!isNonEmptyString(entry)) {
      continue;
    }

    const resolved = normalizeWorkspace(entry);
    if (!normalized.includes(resolved)) {
      normalized.push(resolved);
    }
    if (normalized.length >= limit) {
      break;
    }
  }

  return normalized;
}

function normalizeHeaders(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isNonEmptyString)
    .map((entry) => entry.trim())
    .filter((entry, index, all) => all.indexOf(entry) === index);
}

export class SessionStore {
  private state: PersistedSessionState;
  private transient: TransientState = {
    apiKey: null,
    continueMode: false,
    resumeChatId: null,
  };

  public constructor(
    private readonly sessionFile: string,
    initialWorkspace?: string,
    private readonly defaults: SessionDefaults = {},
  ) {
    this.state = this.load(initialWorkspace);
  }

  public getSnapshot(): SessionSnapshot {
    return {
      commandHistory: [...this.state.commandHistory],
      recentWorkspaces: [...this.state.recentWorkspaces],
      activeWorkspace: this.state.activeWorkspace,
      model: this.state.model,
      mode: this.state.mode,
      forceMode: this.state.forceMode,
      sandbox: this.state.sandbox,
      approveMcps: this.state.approveMcps,
      customHeaders: [...this.state.customHeaders],
      theme: this.state.theme,
      vimMode: this.state.vimMode,
      apiKey: this.transient.apiKey,
      continueMode: this.transient.continueMode,
      resumeChatId: this.transient.resumeChatId,
    };
  }

  public clearCommandHistory(): void {
    this.state.commandHistory = [];
    this.save();
  }

  public recordCommand(command: string): void {
    const trimmed = command.trim();
    if (trimmed.length === 0) {
      return;
    }

    const nextHistory = [
      trimmed,
      ...this.state.commandHistory.filter((existing) => existing !== trimmed),
    ].slice(0, MAX_HISTORY_ITEMS);

    this.state.commandHistory = nextHistory;
    this.save();
  }

  public setActiveWorkspace(workspace: string): string {
    const normalized = normalizeWorkspace(workspace);
    this.state.activeWorkspace = normalized;
    this.state.recentWorkspaces = [
      normalized,
      ...this.state.recentWorkspaces.filter((existing) => existing !== normalized),
    ].slice(0, MAX_RECENT_WORKSPACES);
    this.save();
    return normalized;
  }

  public setModel(model: string | null): void {
    this.state.model = model;
    this.save();
  }

  public setMode(mode: "normal" | "plan" | "ask"): void {
    this.state.mode = mode;
    this.save();
  }

  public setForceMode(force: boolean): void {
    this.state.forceMode = force;
    this.save();
  }

  public setSandbox(mode: "enabled" | "disabled" | null): void {
    this.state.sandbox = mode;
    this.save();
  }

  public setApproveMcps(value: boolean): void {
    this.state.approveMcps = value;
    this.save();
  }

  public addHeader(header: string): void {
    this.state.customHeaders = [...this.state.customHeaders, header];
    this.save();
  }

  public removeHeader(index: number): void {
    this.state.customHeaders = this.state.customHeaders.filter(
      (_, i) => i !== index,
    );
    this.save();
  }

  public clearHeaders(): void {
    this.state.customHeaders = [];
    this.save();
  }

  public setApiKey(key: string | null): void {
    this.transient.apiKey = key;
  }

  public setContinueMode(value: boolean): void {
    this.transient.continueMode = value;
  }

  public setResumeChatId(id: string | null): void {
    this.transient.resumeChatId = id;
  }

  public setTheme(theme: string): void {
    this.state.theme = theme;
    this.save();
  }

  public setVimMode(value: boolean): void {
    this.state.vimMode = value;
    this.save();
  }

  private load(initialWorkspace?: string): PersistedSessionState {
    const normalizedInitialWorkspace = initialWorkspace
      ? normalizeWorkspace(initialWorkspace)
      : null;

    if (existsSync(this.sessionFile)) {
      try {
        const raw = readFileSync(this.sessionFile, "utf8");
        const parsed = JSON.parse(raw) as Partial<PersistedSessionState>;
        const recentWorkspaces = normalizeWorkspaceList(
          parsed.recentWorkspaces,
          MAX_RECENT_WORKSPACES,
        );
        const activeWorkspace = isNonEmptyString(parsed.activeWorkspace)
          ? normalizeWorkspace(parsed.activeWorkspace)
          : normalizedInitialWorkspace;

        if (activeWorkspace && !recentWorkspaces.includes(activeWorkspace)) {
          recentWorkspaces.unshift(activeWorkspace);
        }

        return {
          commandHistory: Array.isArray(parsed.commandHistory)
            ? parsed.commandHistory.filter(
                (entry): entry is string => isNonEmptyString(entry),
              )
                .map((entry) => entry.trim())
                .slice(0, MAX_HISTORY_ITEMS)
            : [],
          recentWorkspaces: recentWorkspaces.slice(0, MAX_RECENT_WORKSPACES),
          activeWorkspace,
          model:
            isNonEmptyString(parsed.model)
              ? parsed.model.trim()
              : this.defaults.model ?? null,
          mode:
            parsed.mode === "normal" ||
            parsed.mode === "plan" ||
            parsed.mode === "ask"
              ? parsed.mode
              : this.defaults.mode ?? "normal",
          forceMode:
            typeof parsed.forceMode === "boolean"
              ? parsed.forceMode
              : this.defaults.forceMode ?? false,
          sandbox:
            parsed.sandbox === "enabled" || parsed.sandbox === "disabled"
              ? parsed.sandbox
              : this.defaults.sandbox ?? null,
          approveMcps:
            typeof parsed.approveMcps === "boolean"
              ? parsed.approveMcps
              : this.defaults.approveMcps ?? false,
          customHeaders: normalizeHeaders(parsed.customHeaders),
          theme: isNonEmptyString(parsed.theme) ? parsed.theme.trim() : "dark",
          vimMode: parsed.vimMode === true,
        };
      } catch {
        return {
          ...DEFAULT_STATE,
          model: this.defaults.model ?? null,
          mode: this.defaults.mode ?? "normal",
          forceMode: this.defaults.forceMode ?? false,
          sandbox: this.defaults.sandbox ?? null,
          approveMcps: this.defaults.approveMcps ?? false,
          activeWorkspace: normalizedInitialWorkspace,
        };
      }
    }

    return {
      ...DEFAULT_STATE,
      model: this.defaults.model ?? null,
      mode: this.defaults.mode ?? "normal",
      forceMode: this.defaults.forceMode ?? false,
      sandbox: this.defaults.sandbox ?? null,
      approveMcps: this.defaults.approveMcps ?? false,
      activeWorkspace: normalizedInitialWorkspace,
    };
  }

  private save(): void {
    try {
      mkdirSync(path.dirname(this.sessionFile), { recursive: true });
      writeFileSync(
        this.sessionFile,
        JSON.stringify(this.state, null, 2) + "\n",
        "utf8",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown session save error";
      process.stderr.write(
        `[crsr] Warning: unable to save session state to ${this.sessionFile}: ${message}\n`,
      );
    }
  }
}

export function createSessionStore(
  paths: ShellPaths,
  initialWorkspace?: string,
  defaults?: SessionDefaults,
): SessionStore {
  return new SessionStore(paths.sessionFile, initialWorkspace, defaults);
}
