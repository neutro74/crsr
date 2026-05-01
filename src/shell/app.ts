import os from "node:os";
import { spawn } from "node:child_process";
import blessed from "blessed";
import type { ShellConfig } from "../config/config.js";
import { contractHome, renderCommandResult } from "../output/renderers.js";
import type { CursorAgentAdapter, StreamEvent } from "../runtime/cursorAgent.js";
import { allCommands, type CommandDefinition } from "../runtime/commandCatalog.js";
import type { SessionSnapshot, SessionStore } from "../session/sessionStore.js";
import { asciiLogoFrames } from "./generatedLogoFrames.js";
import { getTheme, nextThemeId, prevThemeId, THEMES, type Theme } from "./themes.js";
import { ShellRouter } from "./router.js";
import { runSelfUpdate } from "../update.js";

type EntryTone =
  | "system"
  | "command"
  | "stdout"
  | "stderr"
  | "partial"
  | "thinking"
  | "subagent";

interface LogEntry {
  id: string;
  tone: EntryTone;
  text: string;
  time: string;
}

interface TabState {
  id: number;
  entries: LogEntry[];
  busy: boolean;
  statusLine: string;
  partialEntryId: string;
  partialCreated: boolean;
  thinkingEntryId: string;
  thinkingCreated: boolean;
}

export interface AppProps {
  config: ShellConfig;
  adapter: CursorAgentAdapter;
  store: SessionStore;
  initialCommand?: string;
  oneShot?: boolean;
}

const WORDMARK = [
  " ██████╗██████╗ ███████╗██████╗ ",
  "██╔════╝██╔══██╗██╔════╝██╔══██╗",
  "██║     ██████╔╝███████╗██████╔╝",
  "██║     ██╔══██╗╚════██║██╔══██╗",
  "╚██████╗██║  ██║███████║██║  ██║",
  " ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝",
] as const;

const WORDMARK_TOP_OFFSET = 2;

const logoHeight = asciiLogoFrames.reduce(
  (maxHeight, frame) => Math.max(maxHeight, frame.length),
  0,
);
const logoWidth = asciiLogoFrames.reduce(
  (maxWidth, frame) =>
    Math.max(
      maxWidth,
      frame.reduce((lineWidth, line) => Math.max(lineWidth, line.length), 0),
    ),
  0,
);

const normalizedFrameLines = asciiLogoFrames.map((frame) => {
  const paddedLines = frame.map((line) => line.padEnd(logoWidth, " "));
  while (paddedLines.length < logoHeight) {
    paddedLines.push(" ".repeat(logoWidth));
  }
  return paddedLines;
});

const CHAR_SHADE: Record<string, string> = {
  ".": "#303030",
  ",": "#424242",
  ":": "#484848",
  "-": "#606060",
  "~": "#646464",
  "+": "#7e7e7e",
  "=": "#929292",
  "*": "#adadad",
  "o": "#b8b8b8",
  "x": "#c4c4c4",
  "X": "#d2d2d2",
  "#": "#e0e0e0",
  "%": "#f0f0f0",
  "@": "#ffffff",
};

function renderLogoFrame(lines: string[]): string {
  return lines
    .map((line) => {
      const segments: Array<{ shade: string | null; text: string }> = [];
      for (const char of line) {
        const shade = char === " " ? null : (CHAR_SHADE[char] ?? "#888888");
        const last = segments[segments.length - 1];
        if (last && last.shade === shade) {
          last.text += char;
        } else {
          segments.push({ shade, text: char });
        }
      }
      return segments
        .map(({ shade, text }) =>
          shade === null ? text : `{${shade}-fg}${text}{/}`,
        )
        .join("");
    })
    .join("\n");
}

const ANSI_RE = /\x1b\[[0-9;?]*[a-zA-Z]|\x1b[()][0-9A-Z]|\x1b[=>]|\x9b[0-9;]*[a-zA-Z]/g;
function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

let globalEntryCounter = 0;

function nextId(): string {
  globalEntryCounter += 1;
  return `entry-${globalEntryCounter}`;
}

function timestamp(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
}

function shorten(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function escapeTags(value: string): string {
  return value.replace(/\{/gu, "\\{").replace(/\}/gu, "\\}");
}

function applyMarkdown(raw: string, theme: Theme): string {
  try {
    const lines = raw.split("\n");
    let inFence = false;

    return lines
      .map((rawLine) => {
        if (/^```/.test(rawLine)) {
          inFence = !inFence;
          return `{${theme.codeFence}-fg}${rawLine.replace(/\{/g, "\\{").replace(/\}/g, "\\}")}{/}`;
        }
        if (inFence) {
          return `{${theme.codeDim}-fg}${rawLine.replace(/\{/g, "\\{").replace(/\}/g, "\\}")}{/}`;
        }

        let line = rawLine.replace(/\{/g, "\\{").replace(/\}/g, "\\}");

        const headerMatch = /^(#{1,3}) (.+)$/.exec(rawLine);
        if (headerMatch) {
          const title = (headerMatch[2] ?? "").replace(/\{/g, "\\{").replace(/\}/g, "\\}");
          return (headerMatch[1] ?? "").length === 1
            ? `{bold}{${theme.headerColor}-fg}${title}{/}{/bold}`
            : `{bold}${title}{/bold}`;
        }

        line = line.replace(/\*\*([^*\n]+?)\*\*/g, (_, t: string) => `{bold}${t}{/bold}`);
        line = line.replace(/\*([^ *\n][^*\n]*?)\*/g, (_, t: string) => `{underline}${t}{/underline}`);
        line = line.replace(/`([^`\n]+)`/g, (_, t: string) => `{${theme.code}-fg}${t}{/}`);

        return line;
      })
      .join("\n");
  } catch {
    return raw.replace(/\{/g, "\\{").replace(/\}/g, "\\}");
  }
}

function getCommandSuggestions(input: string): CommandDefinition[] {
  if (!input.startsWith("/")) return [];

  const query = input.slice(1).trim().toLowerCase();
  if (query.length === 0) return allCommands.slice(0, 4);

  return [...allCommands]
    .filter((command) => {
      const haystack = `${command.name} ${command.usage} ${command.description}`.toLowerCase();
      return haystack.includes(query);
    })
    .sort((left, right) => {
      const leftStarts = left.name.toLowerCase().startsWith(query) ? 0 : 1;
      const rightStarts = right.name.toLowerCase().startsWith(query) ? 0 : 1;
      return leftStarts - rightStarts || left.name.localeCompare(right.name);
    })
    .slice(0, 3);
}

function getAutocompleteValue(command: CommandDefinition): string {
  return (
    command.usage
      .replace(/\s+\[.*$/u, "")
      .replace(/\s+<.*$/u, "")
      .trimEnd() + " "
  );
}

function pushEntry(entries: LogEntry[], tone: EntryTone, text: string): void {
  const normalized = text.replace(/\s+$/u, "");
  if (normalized.length === 0) return;
  entries.push({ id: nextId(), tone, text: normalized, time: timestamp() });
}

function appendToEntry(
  entries: LogEntry[],
  entryId: string,
  tone: EntryTone,
  text: string,
): void {
  const clean = text.length > 0 ? text : "";
  const existing = entries.find((entry) => entry.id === entryId);
  if (existing) {
    existing.text += clean;
    return;
  }

  entries.push({
    id: entryId,
    tone,
    text: clean,
    time: timestamp(),
  });
}

function chipForTone(tone: EntryTone, theme: Theme): string {
  switch (tone) {
    case "command": return `{${theme.chipYou}-fg}[you]{/}`;
    case "stderr":  return `{${theme.chipErr}-fg}[err]{/}`;
    case "stdout":  return `{${theme.chipOut}-fg}[out]{/}`;
    case "partial": return `{${theme.chipAi}-fg}[ai]{/}`;
    case "thinking": return `{${theme.dim}-fg}[think]{/}`;
    case "subagent": return `{${theme.accent}-fg}[task]{/}`;
    case "system":
    default:        return `{${theme.chipSys}-fg}[—]{/}`;
  }
}

function colorForTone(tone: EntryTone, theme: Theme): string {
  switch (tone) {
    case "command": return `${theme.chipYou}-fg`;
    case "stderr":  return `${theme.error}-fg`;
    case "stdout":  return `${theme.muted}-fg`;
    case "partial": return `${theme.fg}-fg`;
    case "thinking": return `${theme.dim}-fg`;
    case "subagent": return `${theme.accent}-fg`;
    case "system":
    default:        return `${theme.muted}-fg`;
  }
}

function renderEntry(entry: LogEntry, theme: Theme): string {
  const timeTag = `{${theme.dim}-fg}[${entry.time}]{/}`;
  const chip = chipForTone(entry.tone, theme);
  const color = colorForTone(entry.tone, theme);
  const isMarkdown = entry.tone === "partial" || entry.tone === "subagent";

  const continuationIndent = isMarkdown ? "  " : " ".repeat(18);
  const lines = isMarkdown
    ? applyMarkdown(entry.text, theme).split("\n")
    : entry.text.split("\n").map((line) => escapeTags(stripAnsi(line)));

  return lines
    .map((line, index) => {
      if (index === 0) return `${timeTag} ${chip} {${color}}${line}{/}`;
      return `${continuationIndent}{${color}}${line}{/}`;
    })
    .join("\n");
}

function renderTranscript(entries: LogEntry[], theme: Theme): string {
  return entries.map((entry) => renderEntry(entry, theme)).join("\n\n");
}

// ─── Settings panel data ───────────────────────────────────────────────────

interface SettingItem {
  key: string;
  label: string;
  type: "cycle" | "toggle" | "display";
  options?: string[];
  getValue: (snap: SessionSnapshot) => string;
  setValue?: (store: SessionStore, direction: 1 | -1, snap: SessionSnapshot) => void;
}

const SETTINGS_ITEMS: SettingItem[] = [
  {
    key: "theme",
    label: "Theme",
    type: "cycle",
    options: THEMES.map((t) => t.name),
    getValue: (snap) => {
      const t = THEMES.find((th) => th.id === snap.theme);
      return t ? t.name : "Dark";
    },
    setValue: (store, direction, snap) => {
      const id = direction === 1 ? nextThemeId(snap.theme) : prevThemeId(snap.theme);
      store.setTheme(id);
    },
  },
  {
    key: "mode",
    label: "Mode",
    type: "cycle",
    options: ["normal", "plan", "ask"],
    getValue: (snap) => snap.mode,
    setValue: (store, direction, snap) => {
      const opts = ["normal", "plan", "ask"] as const;
      const idx = opts.indexOf(snap.mode);
      const next = opts[(idx + direction + opts.length) % opts.length] ?? "normal";
      store.setMode(next);
    },
  },
  {
    key: "forceMode",
    label: "Force Mode",
    type: "toggle",
    getValue: (snap) => (snap.forceMode ? "on" : "off"),
    setValue: (store, _dir, snap) => store.setForceMode(!snap.forceMode),
  },
  {
    key: "sandbox",
    label: "Sandbox",
    type: "cycle",
    options: ["off", "enabled", "disabled"],
    getValue: (snap) => snap.sandbox ?? "off",
    setValue: (store, direction, snap) => {
      const opts = [null, "enabled", "disabled"] as const;
      const cur = snap.sandbox ?? null;
      const idx = opts.indexOf(cur);
      const next = opts[(idx + direction + opts.length) % opts.length];
      store.setSandbox(next ?? null);
    },
  },
  {
    key: "approveMcps",
    label: "Approve MCPs",
    type: "toggle",
    getValue: (snap) => (snap.approveMcps ? "on" : "off"),
    setValue: (store, _dir, snap) => store.setApproveMcps(!snap.approveMcps),
  },
  {
    key: "vimMode",
    label: "Vim Keybindings",
    type: "toggle",
    getValue: (snap) => (snap.vimMode ? "on" : "off"),
    setValue: (store, _dir, snap) => store.setVimMode(!snap.vimMode),
  },
  {
    key: "model",
    label: "Model",
    type: "display",
    getValue: (snap) => snap.model ?? "default",
  },
  {
    key: "workspace",
    label: "Workspace",
    type: "display",
    getValue: (snap) => contractHome(snap.activeWorkspace ?? os.homedir()),
  },
];

export async function runApp({
  config,
  adapter,
  store,
  initialCommand,
}: AppProps): Promise<void> {
  const router = new ShellRouter(adapter, store, config.commandPassthrough);

  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    title: "crsr",
    dockBorders: true,
    autoPadding: false,
  });

  // ─── Tab state ──────────────────────────────────────────────────────────
  let tabCounter = 0;

  function createTab(): TabState {
    tabCounter += 1;
    return {
      id: tabCounter,
      entries: [],
      busy: false,
      statusLine: "ready",
      partialEntryId: nextId(),
      partialCreated: false,
      thinkingEntryId: nextId(),
      thinkingCreated: false,
    };
  }

  const tabs: TabState[] = [createTab()];
  let activeTabIndex = 0;

  function activeTab(): TabState {
    return tabs[activeTabIndex]!;
  }

  // ─── Overlay state ──────────────────────────────────────────────────────
  let paletteOpen = false;
  let paletteQuery = "";
  let paletteSelectedIndex = 0;
  let paletteResults: CommandDefinition[] = [];

  let settingsOpen = false;
  let settingsSelectedIndex = 0;

  // vim normal mode (separate from vim keybindings setting)
  let normalMode = false;

  // ─── Main layout ────────────────────────────────────────────────────────
  let snapshot: SessionSnapshot = store.getSnapshot();
  let theme: Theme = getTheme(snapshot.theme);

  const background = blessed.box({
    parent: screen,
    width: "100%",
    height: "100%",
    style: { bg: theme.bg },
  });

  const tabBar = blessed.box({
    parent: background,
    top: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: { fg: theme.tabFg, bg: theme.tabBg },
  });

  const shell = blessed.box({
    parent: background,
    top: 1,
    left: 0,
    width: "100%",
    bottom: 0,
    style: { bg: theme.bg },
  });

  const heroBox = blessed.box({
    parent: shell,
    top: 1,
    left: 2,
    right: 2,
    height: 14,
  });

  const logoBox = blessed.box({
    parent: heroBox,
    top: 0,
    left: 0,
    width: logoWidth + 2,
    height: logoHeight,
    align: "left",
    valign: "top",
    tags: true,
    style: { fg: "white" },
  });

  const brandBox = blessed.box({
    parent: heroBox,
    top: WORDMARK_TOP_OFFSET,
    left: logoWidth + 4,
    right: 0,
    height: WORDMARK.length,
    align: "left",
    valign: "top",
    tags: true,
    style: { fg: "white" },
  });

  const metaBox = blessed.box({
    parent: heroBox,
    top: WORDMARK_TOP_OFFSET + WORDMARK.length + 1,
    left: logoWidth + 4,
    right: 0,
    height: 3,
    tags: true,
    style: { fg: theme.muted },
  });

  const transcriptBox = blessed.box({
    parent: shell,
    top: 16,
    left: 1,
    right: 1,
    bottom: 5,
    label: " conversation ",
    border: "line",
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    keys: false,
    vi: false,
    tags: true,
    wrap: true,
    padding: { left: 1, right: 1 },
    scrollbar: {
      ch: "▐",
      track: { bg: theme.bg },
      style: { bg: theme.dim },
    },
    style: {
      fg: theme.fg,
      border: { fg: theme.border },
      label: { fg: theme.label },
    },
  });

  const inputBox = blessed.textbox({
    parent: shell,
    bottom: 2,
    left: 1,
    right: 1,
    height: 3,
    inputOnFocus: true,
    mouse: true,
    keys: true,
    border: "line",
    label: " prompt ",
    style: {
      border: { fg: theme.borderActive },
      label: { fg: theme.label },
      fg: theme.fg,
    },
  });

  const statusBox = blessed.box({
    parent: shell,
    bottom: 1,
    left: 1,
    right: 1,
    height: 1,
    tags: true,
    style: { fg: theme.dim },
  });

  // ─── Command palette overlay ─────────────────────────────────────────────
  const paletteBox = blessed.box({
    parent: screen,
    hidden: true,
    top: "center",
    left: "center",
    width: "60%",
    height: 18,
    border: "line",
    label: " Command Palette ",
    tags: true,
    keys: true,
    mouse: true,
    clickable: true,
    style: {
      fg: theme.fg,
      bg: theme.bg,
      border: { fg: theme.accent },
      label: { fg: theme.accent },
    },
  });

  // ─── Settings panel overlay ───────────────────────────────────────────────
  const settingsBox = blessed.box({
    parent: screen,
    hidden: true,
    top: "center",
    left: "center",
    width: "68%",
    height: SETTINGS_ITEMS.length + 8,
    border: "line",
    label: " Settings ",
    tags: true,
    keys: true,
    mouse: true,
    clickable: true,
    style: {
      fg: theme.fg,
      bg: theme.bg,
      border: { fg: theme.accent },
      label: { fg: theme.accent },
    },
  });

  // ─── Shared mutable state ────────────────────────────────────────────────
  let historyIndex: number | null = null;
  let inputBeforeHistory = "";
  let autoScroll = true;
  let destroyed = false;
  let frameIndex = 0;
  let pendingRenderTimer: ReturnType<typeof setTimeout> | null = null;

  pushEntry(
    activeTab().entries,
    "system",
    `crsr ready — workspace: ${contractHome(store.getSnapshot().activeWorkspace ?? os.homedir())}\nType a prompt, /help for commands, Ctrl+P for palette, /settings for settings.`,
  );
  if (snapshot.sessionWarning) {
    pushEntry(activeTab().entries, "stderr", snapshot.sessionWarning);
  }

  function refreshSnapshot(): void {
    snapshot = store.getSnapshot();
    theme = getTheme(snapshot.theme);
  }

  function requestRender(): void {
    if (destroyed || pendingRenderTimer) {
      return;
    }

    pendingRenderTimer = setTimeout(() => {
      pendingRenderTimer = null;
      renderUi();
    }, 16);
  }

  function getInputValue(): string {
    return inputBox.getValue();
  }

  function setInputValue(value: string): void {
    inputBox.setValue(value);
  }

  function clearInputValue(): void {
    inputBox.clearValue();
  }

  function stopTextboxCapture(): void {
    const textbox = inputBox as blessed.Widgets.TextboxElement & {
      _reading?: boolean;
      _done?: (err?: string | null, value?: string | null) => void;
    };

    if (textbox._reading && textbox._done) {
      textbox._done("stop", null);
    }
  }

  // ─── Tab bar rendering ───────────────────────────────────────────────────
  function renderTabBar(): void {
    const parts: string[] = [];
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i]!;
      const isActive = i === activeTabIndex;
      const busyMark = tab.busy ? ` {${theme.tabBusyFg}-fg}●{/}` : "";
      const label = ` ${String(i + 1)}${busyMark} `;
      if (isActive) {
        parts.push(`{${theme.tabActiveFg}-fg}{bold}[${label}]{/bold}{/}`);
      } else {
        parts.push(`{${theme.tabFg}-fg}[${label}]{/}`);
      }
    }
    const hint = `{${theme.dim}-fg}  Ctrl+T new  Ctrl+W close  Alt+n/p switch  Alt+1-9 jump{/}`;
    tabBar.setContent(parts.join("") + hint);
  }

  // ─── Palette rendering ───────────────────────────────────────────────────
  function getPaletteResults(query: string): CommandDefinition[] {
    if (query.length === 0) return allCommands.slice(0, 12);
    const q = query.toLowerCase();
    return allCommands
      .filter((c) => {
        const hay = `${c.name} ${c.usage} ${c.description}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const aStart = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStart = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return aStart - bStart || a.name.localeCompare(b.name);
      })
      .slice(0, 12);
  }

  function renderPaletteContent(): void {
    paletteResults = getPaletteResults(paletteQuery);
    if (paletteSelectedIndex >= paletteResults.length) {
      paletteSelectedIndex = Math.max(0, paletteResults.length - 1);
    }

    const queryLine = `{${theme.accent}-fg}>{/} ${escapeTags(paletteQuery)}{bold}▌{/bold}`;
    const divider = `{${theme.border}-fg}${"─".repeat(50)}{/}`;

    const items = paletteResults.map((cmd, i) => {
      const isSelected = i === paletteSelectedIndex;
      const usage = escapeTags(cmd.usage.padEnd(32));
      const desc = escapeTags(shorten(cmd.description, 40));
      if (isSelected) {
        return `{${theme.selectionBg}-bg}{${theme.selectionFg}-fg} ${usage}  ${desc} {/}{/}`;
      }
      return `{${theme.accent}-fg} ${cmd.usage.padEnd(32)}{/}{${theme.muted}-fg}  ${shorten(cmd.description, 40)}{/}`;
    });

    const footer = `{${theme.dim}-fg}enter select  ↑↓ navigate  esc close{/}`;
    const emptyMsg = paletteResults.length === 0 ? `\n{${theme.muted}-fg}  No commands match "{${theme.fg}-fg}${escapeTags(paletteQuery)}{/}{${theme.muted}-fg}"{/}` : "";

    paletteBox.setContent(
      [queryLine, divider, ...items, emptyMsg, divider, footer]
        .filter((l) => l !== "")
        .join("\n"),
    );
  }

  function openPalette(): void {
    paletteOpen = true;
    paletteQuery = "";
    paletteSelectedIndex = 0;
    renderPaletteContent();
    stopTextboxCapture();
    screen.saveFocus();
    paletteBox.show();
    paletteBox.focus();
    screen.render();
  }

  function closePalette(): void {
    paletteOpen = false;
    paletteBox.hide();
    screen.restoreFocus();
    screen.render();
  }

  function handlePaletteKey(ch: string | null, key: { name: string; ctrl: boolean }): void {
    if (key.name === "escape") {
      closePalette();
      return;
    }
    if (key.name === "return" || key.name === "enter") {
      const selected = paletteResults[paletteSelectedIndex];
      if (selected) {
        closePalette();
        setInputValue(getAutocompleteValue(selected));
        renderUi();
      } else {
        closePalette();
      }
      return;
    }
    if (key.name === "up") {
      paletteSelectedIndex = Math.max(0, paletteSelectedIndex - 1);
      renderPaletteContent();
      screen.render();
      return;
    }
    if (key.name === "down") {
      paletteSelectedIndex = Math.min(paletteResults.length - 1, paletteSelectedIndex + 1);
      renderPaletteContent();
      screen.render();
      return;
    }
    if (key.name === "backspace") {
      paletteQuery = paletteQuery.slice(0, -1);
      paletteSelectedIndex = 0;
      renderPaletteContent();
      screen.render();
      return;
    }
    if (key.ctrl) return;
    if (ch && ch.length === 1 && ch.charCodeAt(0) >= 32) {
      paletteQuery += ch;
      paletteSelectedIndex = 0;
      renderPaletteContent();
      screen.render();
    }
  }

  // ─── Settings panel ──────────────────────────────────────────────────────
  function renderSettingsContent(): void {
    const snap = store.getSnapshot();
    const lines: string[] = [];

    lines.push(`{${theme.muted}-fg}  ↑↓ navigate   ←→ or enter change value   esc close{/}`);
    lines.push(`{${theme.border}-fg}${"─".repeat(60)}{/}`);

    for (let i = 0; i < SETTINGS_ITEMS.length; i++) {
      const item = SETTINGS_ITEMS[i]!;
      const value = item.getValue(snap);
      const isSelected = i === settingsSelectedIndex;
      const label = item.label.padEnd(20);
      const valueStr = item.type === "display"
        ? `{${theme.muted}-fg}${escapeTags(value)}{/}`
        : `{${theme.accent}-fg}◄ ${escapeTags(value)} ►{/}`;

      if (isSelected) {
        lines.push(`{${theme.selectionBg}-bg}{${theme.selectionFg}-fg}  ${label}  ${value.padEnd(20)} {/}{/}`);
      } else {
        lines.push(`  {${theme.label}-fg}${escapeTags(label)}{/}  ${valueStr}`);
      }
    }

    settingsBox.height = SETTINGS_ITEMS.length + 6;
    settingsBox.setContent(lines.join("\n"));
  }

  function openSettings(): void {
    settingsOpen = true;
    settingsSelectedIndex = 0;
    renderSettingsContent();
    stopTextboxCapture();
    screen.saveFocus();
    settingsBox.show();
    settingsBox.focus();
    screen.render();
  }

  function closeSettings(): void {
    settingsOpen = false;
    settingsBox.hide();
    refreshSnapshot();
    screen.restoreFocus();
    renderUi();
  }

  function handleSettingsKey(_ch: string | null, key: { name: string }): void {
    if (key.name === "escape") {
      closeSettings();
      return;
    }
    if (key.name === "up") {
      settingsSelectedIndex = Math.max(0, settingsSelectedIndex - 1);
      renderSettingsContent();
      screen.render();
      return;
    }
    if (key.name === "down") {
      settingsSelectedIndex = Math.min(SETTINGS_ITEMS.length - 1, settingsSelectedIndex + 1);
      renderSettingsContent();
      screen.render();
      return;
    }

    const item = SETTINGS_ITEMS[settingsSelectedIndex];
    if (!item || item.type === "display" || !item.setValue) return;

    if (key.name === "left") {
      item.setValue(store, -1, store.getSnapshot());
      refreshSnapshot();
      renderSettingsContent();
      screen.render();
      return;
    }
    if (key.name === "right" || key.name === "return" || key.name === "enter") {
      item.setValue(store, 1, store.getSnapshot());
      refreshSnapshot();
      renderSettingsContent();
      screen.render();
    }
  }

  // ─── Tab management ──────────────────────────────────────────────────────
  function switchToTab(index: number): void {
    if (index < 0 || index >= tabs.length) return;
    activeTabIndex = index;
    autoScroll = true;
    renderUi();
  }

  function switchTabRelative(direction: 1 | -1): void {
    if (tabs.length <= 1) return;
    const nextIndex = (activeTabIndex + direction + tabs.length) % tabs.length;
    switchToTab(nextIndex);
  }

  function newTab(): void {
    const tab = createTab();
    pushEntry(
      tab.entries,
      "system",
      `Tab ${tab.id} opened — workspace: ${contractHome(store.getSnapshot().activeWorkspace ?? os.homedir())}`,
    );
    tabs.push(tab);
    activeTabIndex = tabs.length - 1;
    autoScroll = true;
    renderUi();
  }

  function closeTab(): void {
    if (tabs.length === 1) {
      pushEntry(activeTab().entries, "system", "Cannot close the last tab.");
      renderUi();
      return;
    }
    tabs.splice(activeTabIndex, 1);
    activeTabIndex = Math.min(activeTabIndex, tabs.length - 1);
    autoScroll = true;
    renderUi();
  }

  // ─── Terminal program (e.g. nvim) ─────────────────────────────────────────
  async function runTerminalProgram(program: string, args: string[], cwd: string): Promise<void> {
    clearInterval(animationTimer);
    // Exit blessed's alternate screen, restoring terminal for the child process.
    const prog = (screen as unknown as { program: { leave: () => void; enter: () => void } }).program;
    prog.leave();

    await new Promise<void>((resolve) => {
      const child = spawn(program, args, {
        stdio: "inherit",
        cwd,
        env: process.env,
      });
      child.on("close", () => resolve());
      child.on("error", (err) => {
        process.stderr.write(`Failed to launch ${program}: ${err.message}\n`);
        resolve();
      });
    });

    // Re-enter blessed alternate screen.
    prog.enter();
    animationTimer = setInterval(() => {
      frameIndex = (frameIndex + 1) % normalizedFrameLines.length;
      renderUi();
    }, 140);
    renderUi();
  }

  // ─── Meta / status lines ──────────────────────────────────────────────────
  function buildMetaLines(width: number): string {
    const rawWorkspace = snapshot.activeWorkspace ?? config.workspace ?? os.homedir();
    const contracted = contractHome(rawWorkspace);
    const shortWorkspace = shorten(contracted, Math.max(24, width - 12));
    const model = snapshot.model ?? "default";
    const mode = snapshot.mode;
    const force = snapshot.forceMode ? "on" : "off";

    return [
      `{${theme.label}-fg}workspace{/} {${theme.muted}-fg}${escapeTags(shortWorkspace)}{/}`,
      `{${theme.label}-fg}model{/} {${theme.muted}-fg}${escapeTags(model)}{/}   {${theme.label}-fg}mode{/} {${theme.muted}-fg}${escapeTags(mode)}{/}   {${theme.label}-fg}force{/} {${theme.muted}-fg}${escapeTags(force)}{/}`,
      `{${theme.label}-fg}theme{/} {${theme.accent}-fg}${escapeTags(snapshot.theme)}{/}${snapshot.vimMode ? `   {${theme.muted}-fg}vim{/}` : ""}`,
    ].join("\n");
  }

  function buildStatusLine(width: number): string {
    const tab = activeTab();
    const input = getInputValue();
    const suggestions = getCommandSuggestions(input);

    if (tab.busy) {
      return shorten(`running  ${tab.statusLine.replace(/^\$ cursor-agent\s+/u, "")}`, width);
    }

    if (normalMode) {
      return shorten("NORMAL  j/k scroll   i insert   ctrl+c quit", width);
    }

    if (input.startsWith("/") && suggestions.length > 0) {
      return shorten(`tab  ${suggestions.map((c) => c.usage).join("   ")}`, width);
    }

    if (input.startsWith("!")) {
      return shorten("shell mode   enter run command   use cd && ... to change directories", width);
    }

    return shorten("enter run   !cmd shell   ↑↓ history   ctrl+p palette   /settings   ctrl+t tab   alt+n/p switch", width);
  }

  // ─── Main render ──────────────────────────────────────────────────────────
  function renderUi(): void {
    if (destroyed) return;

    const shellWidth = Number(shell.width);
    const shellHeight = Number(shell.height);
    const wideLayout = shellWidth >= 110;
    const heroHeight = wideLayout ? 14 : 21;
    const currentScroll = transcriptBox.getScroll();
    const metaWidth = wideLayout
      ? Math.max(28, shellWidth - logoWidth - 12)
      : Math.max(40, shellWidth - 8);

    heroBox.height = heroHeight;
    transcriptBox.top = heroHeight + 2;
    transcriptBox.height = Math.max(8, shellHeight - heroHeight - 7);

    if (wideLayout) {
      logoBox.top = 0; logoBox.left = 0;
      brandBox.top = WORDMARK_TOP_OFFSET; brandBox.left = logoWidth + 4;
      brandBox.right = 0; brandBox.height = WORDMARK.length;
      metaBox.top = WORDMARK_TOP_OFFSET + WORDMARK.length + 1;
      metaBox.left = logoWidth + 4; metaBox.right = 0;
    } else {
      logoBox.top = 0; logoBox.left = 0;
      brandBox.top = WORDMARK_TOP_OFFSET; brandBox.left = logoWidth + 4;
      brandBox.right = 0; brandBox.height = WORDMARK.length;
      metaBox.top = WORDMARK_TOP_OFFSET + WORDMARK.length + 1;
      metaBox.left = logoWidth + 4; metaBox.right = 0;
    }

    // Apply theme colors dynamically
    background.style.bg = theme.bg;
    shell.style.bg = theme.bg;
    tabBar.style.bg = theme.tabBg;
    tabBar.style.fg = theme.tabFg;
    transcriptBox.style.border.fg = theme.border;
    transcriptBox.style.label.fg = theme.label;
    transcriptBox.style.fg = theme.fg;
    inputBox.style.border.fg = theme.borderActive;
    inputBox.style.label.fg = theme.label;
    inputBox.style.fg = theme.fg;
    statusBox.style.fg = theme.dim;

    const currentFrame = normalizedFrameLines[frameIndex] ?? normalizedFrameLines[0]!;
    logoBox.setContent(renderLogoFrame(currentFrame));
    brandBox.setContent(`{${theme.fg}-fg}${WORDMARK.join("\n")}{/}`);
    metaBox.setContent(buildMetaLines(metaWidth));
    renderTabBar();
    transcriptBox.setContent(renderTranscript(activeTab().entries, theme));
    statusBox.setContent(buildStatusLine(Math.max(40, shellWidth - 8)));

    const promptValue = getInputValue().trimStart();
    const tab = activeTab();
    const inputLabel = tab.busy ? " running " : promptValue.startsWith("!") ? " shell " : " prompt ";
    inputBox.setLabel(inputLabel);

    if (autoScroll) {
      transcriptBox.setScrollPerc(100);
    } else {
      transcriptBox.setScroll(currentScroll);
    }

    screen.render();
  }

  // ─── Submit ───────────────────────────────────────────────────────────────
  async function submitCommand(rawCommand: string): Promise<void> {
    const trimmed = rawCommand.trim();
    const tab = activeTab();
    if (trimmed.length === 0 || tab.busy) return;

    clearInputValue();
    historyIndex = null;
    inputBeforeHistory = "";
    autoScroll = true;
    normalMode = false;
    pushEntry(tab.entries, "command", trimmed);
    renderUi();

    try {
      const outcome = await router.routeInput(trimmed);
      refreshSnapshot();

      if (outcome.kind === "noop") { renderUi(); return; }
      if (outcome.kind === "exit") { destroy(); return; }

      if (outcome.kind === "clear") {
        tab.entries.length = 0;
        pushEntry(tab.entries, "system", "output cleared");
        tab.statusLine = "cleared";
        transcriptBox.scrollTo(0);
        renderUi();
        return;
      }

      if (outcome.kind === "message") {
        pushEntry(tab.entries, "system", `${outcome.title}\n${outcome.body}`);
        tab.statusLine = outcome.title.toLowerCase();
        renderUi();
        return;
      }

      if (outcome.kind === "open-settings") {
        openSettings();
        return;
      }

      if (outcome.kind === "self-update") {
        tab.busy = true;
        renderUi();
        try {
          await runSelfUpdate();
          pushEntry(
            tab.entries,
            "system",
            "Self-update finished. Restart crsr to run the new binary.",
          );
          tab.statusLine = "updated";
        } catch (error) {
          const message = error instanceof Error ? error.message : "Self-update failed";
          pushEntry(tab.entries, "stderr", message);
          tab.statusLine = "error";
        } finally {
          tab.busy = false;
        }
        refreshSnapshot();
        renderUi();
        return;
      }

      if (outcome.kind === "tab-action") {
        if (outcome.action === "new") { newTab(); return; }
        if (outcome.action === "close") { closeTab(); return; }
        if (outcome.action === "switch" && outcome.index !== undefined) {
          switchToTab(outcome.index);
          return;
        }
        return;
      }

      if (outcome.kind === "terminal") {
        pushEntry(tab.entries, "system", `Launching ${outcome.program} in ${outcome.cwd}…`);
        renderUi();
        await runTerminalProgram(outcome.program, outcome.args, outcome.cwd);
        pushEntry(tab.entries, "system", `Returned from ${outcome.program}.`);
        renderUi();
        inputBox.focus();
        return;
      }

      // kind === "run"
      tab.busy = true;
      tab.statusLine = outcome.label;
      tab.partialEntryId = nextId();
      tab.partialCreated = false;
      tab.thinkingEntryId = nextId();
      tab.thinkingCreated = false;
      renderUi();

      const emitEvent = (event: StreamEvent): void => {
        const currentTab = activeTab();
        switch (event.type) {
          case "status":
            tab.statusLine = event.message;
            if (tab === currentTab) requestRender();
            break;
          case "stderr":
            pushEntry(tab.entries, "stderr", stripAnsi(event.text));
            if (tab === currentTab) requestRender();
            break;
          case "stdout":
            pushEntry(tab.entries, "stdout", stripAnsi(event.text));
            if (tab === currentTab) requestRender();
            break;
          case "partial": {
            const clean = stripAnsi(event.text);
            if (!tab.partialCreated) {
              tab.partialCreated = true;
            }
            appendToEntry(tab.entries, tab.partialEntryId, "partial", clean);
            if (tab === currentTab) requestRender();
            break;
          }
          case "thinking": {
            tab.thinkingCreated = true;
            appendToEntry(tab.entries, tab.thinkingEntryId, "thinking", stripAnsi(event.text));
            if (tab === currentTab) requestRender();
            break;
          }
          case "thinking-complete":
            if (tab.thinkingCreated) {
              tab.thinkingCreated = false;
              tab.thinkingEntryId = nextId();
            }
            if (tab === currentTab) {
              requestRender();
            }
            break;
          case "subagent": {
            const text = event.phase === "started"
              ? `Started subagent: ${event.description}`
              : event.summary
                ? `Completed subagent: ${event.description}\n${event.summary}`
                : `Completed subagent: ${event.description}`;
            pushEntry(tab.entries, "subagent", text);
            if (tab === currentTab) requestRender();
            break;
          }
          case "json":
            break;
        }
      };

      const result = await outcome.execute(emitEvent);
      pushEntry(tab.entries, "system", renderCommandResult(result));
      tab.statusLine = result.exitCode === 0 ? "ready" : `exit ${result.exitCode}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown wrapper error";
      pushEntry(tab.entries, "stderr", message);
      tab.statusLine = "error";
    } finally {
      tab.busy = false;
      refreshSnapshot();
      renderUi();
      if (!settingsOpen && !paletteOpen && !destroyed) {
        inputBox.focus();
      }
    }
  }

  // ─── Animation timer ──────────────────────────────────────────────────────
  let animationTimer = setInterval(() => {
    frameIndex = (frameIndex + 1) % normalizedFrameLines.length;
    renderUi();
  }, 140);

  // ─── Destroy ──────────────────────────────────────────────────────────────
  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    clearInterval(animationTimer);
    if (pendingRenderTimer) {
      clearTimeout(pendingRenderTimer);
      pendingRenderTimer = null;
    }
    try {
      const maybeScreen = screen as blessed.Widgets.Screen & {
        program?: { destroy?: () => void; isAlt?: boolean };
        emit: (event: string) => boolean;
      };
      if (maybeScreen.program) {
        screen.destroy();
      } else {
        maybeScreen.emit("destroy");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown screen cleanup error";
      process.stderr.write(`crsr cleanup warning: ${message}\n`);
      (screen as blessed.Widgets.Screen & { emit: (event: string) => boolean }).emit("destroy");
    }
  }

  // ─── Screen-level keypress (palette / settings interception) ─────────────
  screen.on("keypress", (ch: string | null, key: { name: string; ctrl: boolean; meta: boolean; shift: boolean; full: string }) => {
    if (paletteOpen) {
      // Always allow Ctrl+C through
      if (key.name === "c" && key.ctrl) { destroy(); return; }
      handlePaletteKey(ch, key);
      return;
    }

    if (settingsOpen) {
      if (key.name === "c" && key.ctrl) { destroy(); return; }
      handleSettingsKey(ch, key);
      return;
    }

    // Global overlay shortcuts.
    if (key.name === "p" && key.ctrl && !paletteOpen && !settingsOpen) {
      openPalette();
      return;
    }
    if (key.meta && key.name === "n" && !paletteOpen && !settingsOpen) {
      switchTabRelative(1);
      return;
    }
    if (key.meta && key.name === "p" && !paletteOpen && !settingsOpen) {
      switchTabRelative(-1);
      return;
    }

    // Vim normal mode scroll handling
    if (normalMode) {
      if (key.name === "i" || key.name === "return") {
        normalMode = false;
        inputBox.focus();
        renderUi();
        return;
      }
      if (key.name === "j") {
        autoScroll = false;
        transcriptBox.scroll(1);
        screen.render();
        return;
      }
      if (key.name === "k") {
        autoScroll = false;
        transcriptBox.scroll(-1);
        screen.render();
        return;
      }
      if (key.name === "g" && !key.shift) {
        transcriptBox.setScrollPerc(0);
        autoScroll = false;
        screen.render();
        return;
      }
      if (key.name === "g" && key.shift) {
        transcriptBox.setScrollPerc(100);
        autoScroll = true;
        screen.render();
        return;
      }
    }
  });

  // ─── Key bindings ─────────────────────────────────────────────────────────
  screen.key(["C-c"], () => { destroy(); });
  screen.key(["C-l"], () => {
    activeTab().entries.length = 0;
    pushEntry(activeTab().entries, "system", "cleared");
    transcriptBox.scrollTo(0);
    autoScroll = true;
    renderUi();
  });

  // Command palette
  screen.key(["C-p"], () => {
    if (!paletteOpen && !settingsOpen) openPalette();
    else if (paletteOpen) closePalette();
  });

  // Tabs
  screen.key(["C-t"], () => { if (!paletteOpen && !settingsOpen) newTab(); });
  screen.key(["C-w"], () => { if (!paletteOpen && !settingsOpen) closeTab(); });

  // Alt+1-9 for tab switching
  for (let i = 1; i <= 9; i++) {
    const idx = i - 1;
    screen.key([`M-${i}`], () => { switchToTab(idx); });
  }

  screen.key(["pageup"], () => {
    autoScroll = false;
    transcriptBox.scroll(-5);
    screen.render();
  });

  screen.key(["pagedown"], () => {
    transcriptBox.scroll(5);
    if (transcriptBox.getScrollPerc() >= 99) autoScroll = true;
    screen.render();
  });

  screen.on("wheelup", () => {
    autoScroll = false;
    transcriptBox.scroll(-1);
    screen.render();
  });

  screen.on("wheeldown", () => {
    transcriptBox.scroll(1);
    if (transcriptBox.getScrollPerc() >= 99) autoScroll = true;
    screen.render();
  });

  screen.on("resize", () => { renderUi(); });

  // ─── Input box key bindings ───────────────────────────────────────────────
  inputBox.key(["C-u"], () => {
    clearInputValue();
    historyIndex = null;
    inputBeforeHistory = "";
    renderUi();
    return false;
  });

  inputBox.key("tab", () => {
    const [firstSuggestion] = getCommandSuggestions(getInputValue());
    if (firstSuggestion) {
      setInputValue(getAutocompleteValue(firstSuggestion));
      renderUi();
    }
    return false;
  });

  inputBox.key("escape", () => {
    if (snapshot.vimMode) {
      // Enter vim normal mode
      normalMode = true;
      renderUi();
    } else {
      clearInputValue();
    }
    historyIndex = null;
    inputBeforeHistory = "";
    renderUi();
    return false;
  });

  inputBox.key("up", () => {
    if (snapshot.vimMode && getInputValue().length === 0) {
      autoScroll = false;
      transcriptBox.scroll(-1);
      screen.render();
      return false;
    }
    const tab = activeTab();
    if (tab.busy || snapshot.commandHistory.length === 0) return false;
    if (historyIndex === null) {
      inputBeforeHistory = getInputValue();
      historyIndex = 0;
    } else {
      historyIndex = Math.min(historyIndex + 1, snapshot.commandHistory.length - 1);
    }
    setInputValue(snapshot.commandHistory[historyIndex] ?? inputBeforeHistory);
    renderUi();
    return false;
  });

  inputBox.key("down", () => {
    if (snapshot.vimMode && getInputValue().length === 0) {
      transcriptBox.scroll(1);
      if (transcriptBox.getScrollPerc() >= 99) autoScroll = true;
      screen.render();
      return false;
    }
    if (historyIndex === null) return false;
    const nextIndex = historyIndex - 1;
    if (nextIndex < 0) {
      historyIndex = null;
      setInputValue(inputBeforeHistory);
    } else {
      historyIndex = nextIndex;
      setInputValue(snapshot.commandHistory[nextIndex] ?? inputBeforeHistory);
    }
    renderUi();
    return false;
  });

  inputBox.on("keypress", () => { setImmediate(renderUi); });

  inputBox.on("submit", (value: string) => {
    void submitCommand(value);
  });

  inputBox.focus();
  renderUi();

  if (initialCommand) {
    void submitCommand(initialCommand);
  }

  await new Promise<void>((resolve) => {
    screen.on("destroy", () => resolve());
  });
}
