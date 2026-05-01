import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
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

export interface SessionSnapshot extends PersistedSessionState, TransientState {
  sessionWarning: string | null;
}
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

function normalizeWorkspace(workspace: string): string {
  return path.resolve(workspace);
}

export class SessionStore {
  private state: PersistedSessionState;
  private sessionWarning: string | null = null;
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
      sessionWarning: this.sessionWarning,
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
    ].slice(0, 200);

    this.state.commandHistory = nextHistory;
    this.save();
  }

  public setActiveWorkspace(workspace: string): string {
    const normalized = normalizeWorkspace(workspace);
    this.state.activeWorkspace = normalized;
    this.state.recentWorkspaces = [
      normalized,
      ...this.state.recentWorkspaces.filter((existing) => existing !== normalized),
    ].slice(0, 20);
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

  private createDefaultState(
    initialWorkspace?: string,
  ): PersistedSessionState {
    return {
      ...DEFAULT_STATE,
      model: this.defaults.model ?? null,
      mode: this.defaults.mode ?? "normal",
      forceMode: this.defaults.forceMode ?? false,
      sandbox: this.defaults.sandbox ?? null,
      approveMcps: this.defaults.approveMcps ?? false,
      activeWorkspace: initialWorkspace
        ? normalizeWorkspace(initialWorkspace)
        : null,
    };
  }

  private load(initialWorkspace?: string): PersistedSessionState {
    if (existsSync(this.sessionFile)) {
      try {
        const raw = readFileSync(this.sessionFile, "utf8");
        const parsed = JSON.parse(raw) as Partial<PersistedSessionState>;
        return {
          commandHistory: Array.isArray(parsed.commandHistory)
            ? parsed.commandHistory.filter(
                (entry): entry is string => typeof entry === "string",
              )
            : [],
          recentWorkspaces: Array.isArray(parsed.recentWorkspaces)
            ? parsed.recentWorkspaces.filter(
                (entry): entry is string => typeof entry === "string",
              )
            : [],
          activeWorkspace:
            typeof parsed.activeWorkspace === "string"
              ? parsed.activeWorkspace
              : initialWorkspace
                ? normalizeWorkspace(initialWorkspace)
                : null,
          model:
            typeof parsed.model === "string"
              ? parsed.model
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
          customHeaders: Array.isArray(parsed.customHeaders)
            ? parsed.customHeaders.filter(
                (entry): entry is string => typeof entry === "string",
              )
            : [],
          theme: typeof parsed.theme === "string" ? parsed.theme : "dark",
          vimMode: parsed.vimMode === true,
        };
      } catch (error) {
        const backupPath = `${this.sessionFile}.corrupt-${Date.now()}`;
        try {
          copyFileSync(this.sessionFile, backupPath);
          this.sessionWarning =
            `Session state could not be loaded and was reset. A backup was saved to ${backupPath}.`;
        } catch {
          this.sessionWarning =
            `Session state could not be loaded and was reset. The existing file at ${this.sessionFile} may be corrupt.`;
        }

        if (error instanceof Error && error.message) {
          this.sessionWarning += ` (${error.message})`;
        }

        return this.createDefaultState(initialWorkspace);
      }
    }

    return this.createDefaultState(initialWorkspace);
  }

  private save(): void {
    writeFileSync(
      this.sessionFile,
      JSON.stringify(this.state, null, 2) + "\n",
      "utf8",
    );
  }
}

export function createSessionStore(
  paths: ShellPaths,
  initialWorkspace?: string,
  defaults?: SessionDefaults,
): SessionStore {
  return new SessionStore(paths.sessionFile, initialWorkspace, defaults);
}
