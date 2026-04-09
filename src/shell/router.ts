import { statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  renderHelp,
  renderHistory,
  renderWorkspace,
  renderRecent,
  renderConfig,
} from "../output/renderers.js";
import { allCommands } from "../runtime/commandCatalog.js";
import type {
  CommandRunResult,
  CursorAgentAdapter,
  StreamEvent,
} from "../runtime/cursorAgent.js";
import { runLocalShellCommand } from "../runtime/localShell.js";
import { agentCommands, sessionCommands } from "../runtime/commandCatalog.js";
import type { SessionStore } from "../session/sessionStore.js";

export type RouteOutcome =
  | { kind: "noop" }
  | { kind: "clear" }
  | { kind: "exit" }
  | { kind: "open-settings" }
  | { kind: "self-update" }
  | { kind: "message"; title: string; body: string }
  | { kind: "tab-action"; action: "new" | "close" | "switch"; index?: number }
  | { kind: "terminal"; program: string; args: string[]; cwd: string }
  | {
      kind: "run";
      label: string;
      execute: (
        onEvent: (event: StreamEvent) => void,
      ) => Promise<CommandRunResult>;
    };

function expandHome(rawPath: string): string {
  if (rawPath === "~") return os.homedir();
  if (rawPath.startsWith("~/")) return path.join(os.homedir(), rawPath.slice(2));
  return rawPath;
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const character of input.trim()) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }

    if (character === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (/\s/.test(character)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += character;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

function sanitizeCommandForHistory(input: string): string {
  if (input.startsWith("/api-key ")) {
    return "/api-key [REDACTED]";
  }

  if (input.startsWith("/header add ")) {
    return "/header add [REDACTED]";
  }

  return input;
}

const directDelegateNames = new Set([
  ...agentCommands.map((command) => command.name),
  ...sessionCommands
    .map((command) => command.name)
    .filter((name) => name !== "cloud" && name !== "worktree"),
]);

export class ShellRouter {
  public constructor(
    private readonly adapter: CursorAgentAdapter,
    private readonly store: SessionStore,
    private readonly allowPassthrough: boolean,
  ) {}

  public async routeInput(rawInput: string): Promise<RouteOutcome> {
    const input = rawInput.trim();
    if (input.length === 0) {
      return { kind: "noop" };
    }

    this.store.recordCommand(sanitizeCommandForHistory(input));

    if (input.startsWith("!")) {
      return this.runShellCommand(input.slice(1).trim());
    }

    if (!input.startsWith("/")) {
      return this.runPrompt(input);
    }

    const tokens = tokenize(input.slice(1));
    const [command, ...args] = tokens;

    switch (command) {
      case undefined:
        return { kind: "noop" };

      case "help":
        if (args.length > 0) {
          const query = args.join(" ").toLowerCase();
          const command = allCommands.find(
            (entry) =>
              entry.name === query ||
              entry.usage.replace(/^\//u, "").startsWith(query),
          );
          if (command) {
            return {
              kind: "message",
              title: `Help: /${command.name}`,
              body: `${command.description}\nUsage: ${command.usage}`,
            };
          }
        }
        return { kind: "message", title: "Commands", body: renderHelp() };

      case "clear":
        return { kind: "clear" };

      case "history":
        return {
          kind: "message",
          title: "History",
          body: renderHistory(this.store.getSnapshot()),
        };

      case "plan":
        this.store.setMode("plan");
        return {
          kind: "message",
          title: "Mode",
          body: "Mode set to plan.",
        };

      case "ask":
        this.store.setMode("ask");
        return {
          kind: "message",
          title: "Mode",
          body: "Mode set to ask.",
        };

      case "workspace":
      case "cd":
        if (args.length === 0) {
          return {
            kind: "message",
            title: "Workspace",
            body: renderWorkspace(this.store.getSnapshot()),
          };
        }
        return this.setWorkspace(args.join(" "));

      case "recent": {
        const snapshot = this.store.getSnapshot();
        if (args.length > 0) {
          const index = parseInt(args[0]!, 10);
          if (isNaN(index) || index < 1) {
            return {
              kind: "message",
              title: "Recent",
              body: "Usage: /recent [n]  (use /recent to view saved workspaces)",
            };
          }
          const target = snapshot.recentWorkspaces[index - 1];
          if (!target) {
            return {
              kind: "message",
              title: "Recent",
              body: `No workspace at position ${index}. Run /recent to see the list.`,
            };
          }
          return this.setWorkspace(target);
        }
        return {
          kind: "message",
          title: "Recent Workspaces",
          body: renderRecent(snapshot),
        };
      }

      case "exit":
      case "quit":
        return { kind: "exit" };

      case "model":
        if (args.length === 0) {
          const current = this.store.getSnapshot().model;
          return {
            kind: "message",
            title: "Model",
            body: current ? `Current model: ${current}` : "Using default model. Set with /model <name>",
          };
        }
        if (args[0] === "reset" || args[0] === "default") {
          this.store.setModel(null);
          return { kind: "message", title: "Model", body: "Reset to default model." };
        }
        this.store.setModel(args[0]!);
        return {
          kind: "message",
          title: "Model",
          body: `Model set to ${args[0]}. All prompts will use this model.`,
        };

      case "mode":
        if (args.length === 0) {
          return {
            kind: "message",
            title: "Mode",
            body: `Current mode: ${this.store.getSnapshot().mode}\nOptions: normal, plan, ask`,
          };
        }
        if (args[0] === "normal" || args[0] === "plan" || args[0] === "ask") {
          this.store.setMode(args[0]);
          return {
            kind: "message",
            title: "Mode",
            body: `Mode set to ${args[0]}.`,
          };
        }
        return {
          kind: "message",
          title: "Mode",
          body: `Unknown mode "${args[0]}". Options: normal, plan, ask`,
        };

      case "force":
      case "yolo": {
        const next = !this.store.getSnapshot().forceMode;
        this.store.setForceMode(next);
        return {
          kind: "message",
          title: "Force Mode",
          body: next
            ? "Force mode ON. Commands will run without confirmation."
            : "Force mode OFF. Commands will ask for confirmation.",
        };
      }

      case "auto-run": {
        if (args[0] === "status") {
          return {
            kind: "message",
            title: "Auto-Run",
            body: this.store.getSnapshot().forceMode ? "Auto-run is ON." : "Auto-run is OFF.",
          };
        }
        if (args[0] === "on") {
          this.store.setForceMode(true);
          return {
            kind: "message",
            title: "Auto-Run",
            body: "Auto-run is ON.",
          };
        }
        if (args[0] === "off") {
          this.store.setForceMode(false);
          return {
            kind: "message",
            title: "Auto-Run",
            body: "Auto-run is OFF.",
          };
        }
        const next = !this.store.getSnapshot().forceMode;
        this.store.setForceMode(next);
        return {
          kind: "message",
          title: "Auto-Run",
          body: next ? "Auto-run is ON." : "Auto-run is OFF.",
        };
      }

      case "sandbox": {
        if (args.length === 0) {
          const current = this.store.getSnapshot().sandbox;
          return {
            kind: "message",
            title: "Sandbox",
            body: current
              ? `Sandbox: ${current}`
              : "Sandbox: off (using cursor-agent default)\nOptions: /sandbox enabled | disabled | off",
          };
        }
        const mode = args[0];
        if (mode === "enabled" || mode === "disabled") {
          this.store.setSandbox(mode);
          return {
            kind: "message",
            title: "Sandbox",
            body: `Sandbox set to ${mode}.`,
          };
        }
        if (mode === "off" || mode === "clear" || mode === "reset") {
          this.store.setSandbox(null);
          return {
            kind: "message",
            title: "Sandbox",
            body: "Sandbox cleared (using cursor-agent default).",
          };
        }
        return {
          kind: "message",
          title: "Sandbox",
          body: `Unknown value "${mode}". Options: enabled | disabled | off`,
        };
      }

      case "approve-mcps": {
        const next = !this.store.getSnapshot().approveMcps;
        this.store.setApproveMcps(next);
        return {
          kind: "message",
          title: "Approve MCPs",
          body: next
            ? "Auto-approve MCPs ON. All MCP servers will be approved automatically."
            : "Auto-approve MCPs OFF.",
        };
      }

      case "continue": {
        const next = !this.store.getSnapshot().continueMode;
        this.store.setContinueMode(next);
        return {
          kind: "message",
          title: "Continue Mode",
          body: next
            ? "Continue mode ON. Each prompt will append to the previous session."
            : "Continue mode OFF.",
        };
      }

      case "resume": {
        if (args.length === 0) {
          const current = this.store.getSnapshot().resumeChatId;
          return {
            kind: "message",
            title: "Resume",
            body: current
              ? `Resuming chat: ${current}\nUse /resume clear to stop.`
              : "No chat ID set. Use /resume <chatId> or /ls to find IDs.",
          };
        }
        if (args[0] === "clear" || args[0] === "off" || args[0] === "reset") {
          this.store.setResumeChatId(null);
          return {
            kind: "message",
            title: "Resume",
            body: "Resume cleared. New prompts will start fresh sessions.",
          };
        }
        this.store.setResumeChatId(args[0]!);
        return {
          kind: "message",
          title: "Resume",
          body: `Resuming chat ${args[0]} for all subsequent prompts.\nUse /resume clear to stop.`,
        };
      }

      case "api-key": {
        if (args.length === 0) {
          const key = this.store.getSnapshot().apiKey;
          return {
            kind: "message",
            title: "API Key",
            body: key
              ? `API key set: ${key.slice(0, 8)}… (${key.length} chars). Use /api-key clear to remove.`
              : "No API key set. Use /api-key <key> or set CURSOR_API_KEY env var.",
          };
        }
        if (args[0] === "clear" || args[0] === "reset") {
          this.store.setApiKey(null);
          return {
            kind: "message",
            title: "API Key",
            body: "API key cleared for this session.",
          };
        }
        this.store.setApiKey(args[0]!);
        return {
          kind: "message",
          title: "API Key",
          body: `API key set for this session (not persisted to disk).`,
        };
      }

      case "header": {
        const sub = args[0];
        if (!sub || sub === "list") {
          const headers = this.store.getSnapshot().customHeaders;
          if (headers.length === 0) {
            return {
              kind: "message",
              title: "Headers",
              body: "No custom headers set.\nUsage: /header add <Name: Value>",
            };
          }
          const lines = headers.map(
            (h, i) => `  ${String(i + 1).padStart(2)}  ${h}`,
          );
          return {
            kind: "message",
            title: "Headers",
            body: lines.join("\n"),
          };
        }
        if (sub === "add") {
          const value = args.slice(1).join(" ");
          if (!value) {
            return {
              kind: "message",
              title: "Headers",
              body: "Usage: /header add <Name: Value>",
            };
          }
          this.store.addHeader(value);
          return {
            kind: "message",
            title: "Headers",
            body: `Added header: ${value}`,
          };
        }
        if (sub === "remove" || sub === "rm") {
          const index = parseInt(args[1] ?? "", 10);
          if (isNaN(index) || index < 1) {
            return {
              kind: "message",
              title: "Headers",
              body: "Usage: /header remove <n>  (use /header list to see indices)",
            };
          }
          const headers = this.store.getSnapshot().customHeaders;
          if (index > headers.length) {
            return {
              kind: "message",
              title: "Headers",
              body: `No header at position ${index}.`,
            };
          }
          this.store.removeHeader(index - 1);
          return {
            kind: "message",
            title: "Headers",
            body: `Removed header ${index}.`,
          };
        }
        if (sub === "clear") {
          this.store.clearHeaders();
          return {
            kind: "message",
            title: "Headers",
            body: "All custom headers cleared.",
          };
        }
        return {
          kind: "message",
          title: "Headers",
          body: `Unknown subcommand "${sub}". Options: add | remove | list | clear`,
        };
      }

      case "config":
        return {
          kind: "message",
          title: "Session Config",
          body: renderConfig(this.store.getSnapshot()),
        };

      case "new-chat":
        this.store.setContinueMode(false);
        this.store.setResumeChatId(null);
        return {
          kind: "clear",
        };

      case "theme": {
        if (args.length === 0) {
          const current = this.store.getSnapshot().theme;
          return {
            kind: "message",
            title: "Theme",
            body: `Current theme: ${current}\nOptions: dark, dracula, nord, gruvbox, catppuccin\nUsage: /theme <name>`,
          };
        }
        const validThemes = ["dark", "dracula", "nord", "gruvbox", "catppuccin"];
        const themeName = args[0]!.toLowerCase();
        if (!validThemes.includes(themeName)) {
          return {
            kind: "message",
            title: "Theme",
            body: `Unknown theme "${args[0]}". Options: ${validThemes.join(", ")}`,
          };
        }
        this.store.setTheme(themeName);
        return {
          kind: "message",
          title: "Theme",
          body: `Theme set to ${themeName}.`,
        };
      }

      case "vim": {
        const next = !this.store.getSnapshot().vimMode;
        this.store.setVimMode(next);
        return {
          kind: "message",
          title: "Vim Mode",
          body: next
            ? "Vim mode ON. j/k scroll transcript, ESC to normal mode."
            : "Vim mode OFF.",
        };
      }

      case "tab": {
        const sub = args[0];
        if (!sub || sub === "new") {
          return { kind: "tab-action", action: "new" };
        }
        if (sub === "close") {
          return { kind: "tab-action", action: "close" };
        }
        const tabIndex = parseInt(sub, 10);
        if (!isNaN(tabIndex) && tabIndex >= 1) {
          return { kind: "tab-action", action: "switch", index: tabIndex - 1 };
        }
        return {
          kind: "message",
          title: "Tab",
          body: "Usage: /tab [new|close|<n>]  —  Ctrl+T new, Ctrl+W close, Alt+n/p switch, Alt+1-9 jump",
        };
      }

      case "nvim": {
        const snapshot = this.store.getSnapshot();
        const cwd = snapshot.activeWorkspace ?? process.cwd();
        const file = args.length > 0 ? args.join(" ") : undefined;
        return {
          kind: "terminal",
          program: "nvim",
          args: file ? [file] : [],
          cwd,
        };
      }

      case "settings":
        return { kind: "open-settings" };

      case "crsr-update":
        return { kind: "self-update" };

      case "compress":
        return {
          kind: "message",
          title: "Compress",
          body: "Conversation compressed. (Context summarisation is applied automatically by the agent for long sessions.)",
        };

      case "raw":
        if (args.length === 0) {
          return {
            kind: "message",
            title: "Raw",
            body: "Usage: /raw <cursor-agent args...>",
          };
        }
        return this.delegate(args, "passthrough");

      case "mcp":
        if (args.length === 0) {
          return {
            kind: "message",
            title: "MCP",
            body: "Usage: /mcp list | login | list-tools | enable | disable <id>",
          };
        }
        return this.delegate(["mcp", ...args], "mcp");

      case "cloud":
        return this.delegate(["--cloud"], "cloud");

      case "worktree": {
        const worktreeArgs: string[] = ["-w"];
        const remainingArgs = [...args];

        const baseIndex = remainingArgs.indexOf("--base");
        let baseBranch: string | null = null;
        if (baseIndex !== -1) {
          baseBranch = remainingArgs[baseIndex + 1] ?? null;
          remainingArgs.splice(baseIndex, baseBranch ? 2 : 1);
        }

        const skipSetup = remainingArgs.includes("--skip-setup");
        const filteredArgs = remainingArgs.filter((a) => a !== "--skip-setup");

        if (filteredArgs.length > 0) {
          worktreeArgs.push(filteredArgs.join(" "));
        }

        if (baseBranch) {
          worktreeArgs.push("--worktree-base", baseBranch);
        }

        if (skipSetup) {
          worktreeArgs.push("--skip-worktree-setup");
        }

        return this.delegate(worktreeArgs, "worktree");
      }

      case "whoami":
        return this.delegate(["status"], "status");

      case "rules":
        return this.delegate(["generate-rule"], "generate-rule");

      case "setup-terminal":
        return this.delegate(["install-shell-integration"], "install-shell-integration");

      default:
        if (directDelegateNames.has(command)) {
          return this.delegate([command, ...args], command);
        }

        if (this.allowPassthrough) {
          return this.delegate([command, ...args], command);
        }

        return {
          kind: "message",
          title: "Unknown",
          body: `Unknown command "${command}". Type /help to see all commands.`,
        };
    }
  }

  private delegate(args: string[], label: string): RouteOutcome {
    const snapshot = this.store.getSnapshot();

    return {
      kind: "run",
      label,
      execute: async (onEvent) =>
        this.adapter.runCommand(
          { args, workspace: snapshot.activeWorkspace },
          onEvent,
        ),
    };
  }

  private runPrompt(prompt: string): RouteOutcome {
    const snapshot = this.store.getSnapshot();
    const parts: string[] = [];
    if (snapshot.model) parts.push(snapshot.model);
    if (snapshot.mode !== "normal") parts.push(snapshot.mode);
    if (snapshot.continueMode) parts.push("continue");
    if (snapshot.resumeChatId) parts.push(`resume:${snapshot.resumeChatId.slice(0, 8)}`);
    if (snapshot.sandbox) parts.push(`sandbox:${snapshot.sandbox}`);
    const label = `prompt${parts.length > 0 ? ` (${parts.join(", ")})` : ""}`;

    return {
      kind: "run",
      label,
      execute: async (onEvent) =>
        this.adapter.runPrompt(prompt, snapshot, onEvent),
    };
  }

  private runShellCommand(command: string): RouteOutcome {
    if (command.length === 0) {
      return {
        kind: "message",
        title: "Shell Mode",
        body: "Use !<command> to run a local shell command. Example: !pwd",
      };
    }

    const snapshot = this.store.getSnapshot();
    const cwd = snapshot.activeWorkspace ?? process.cwd();

    return {
      kind: "run",
      label: `shell: ${command}`,
      execute: async (onEvent) => runLocalShellCommand(command, cwd, onEvent),
    };
  }

  private setWorkspace(rawWorkspace: string): RouteOutcome {
    const expanded = expandHome(rawWorkspace.trim());
    const nextWorkspace = path.resolve(expanded);
    let stats;

    try {
      stats = statSync(nextWorkspace);
    } catch {
      return {
        kind: "message",
        title: "Workspace",
        body: `Path does not exist: ${nextWorkspace}`,
      };
    }

    if (!stats.isDirectory()) {
      return {
        kind: "message",
        title: "Workspace",
        body: `Path is not a directory: ${nextWorkspace}`,
      };
    }

    this.store.setActiveWorkspace(nextWorkspace);
    return {
      kind: "message",
      title: "Workspace",
      body: `Set to ${nextWorkspace}`,
    };
  }
}
