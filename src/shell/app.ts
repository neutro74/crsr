import os from "node:os";
import blessed from "blessed";
import type { ShellConfig } from "../config/config.js";
import { contractHome, renderCommandResult } from "../output/renderers.js";
import type { CursorAgentAdapter, StreamEvent } from "../runtime/cursorAgent.js";
import {
  allCommands,
  type CommandDefinition,
} from "../runtime/commandCatalog.js";
import type { SessionSnapshot, SessionStore } from "../session/sessionStore.js";
import { asciiLogoFrames } from "./generatedLogoFrames.js";
import { ShellRouter } from "./router.js";

type EntryTone = "system" | "command" | "stdout" | "stderr" | "partial";

interface LogEntry {
  id: string;
  tone: EntryTone;
  text: string;
  time: string;
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

// Pre-padded frame lines (each frame is an array of equal-width strings).
const normalizedFrameLines = asciiLogoFrames.map((frame) => {
  const paddedLines = frame.map((line) => line.padEnd(logoWidth, " "));
  while (paddedLines.length < logoHeight) {
    paddedLines.push(" ".repeat(logoWidth));
  }
  return paddedLines;
});

// Maps ASCII shading characters to hex gray values (darkest → brightest).
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

// Strip ANSI/VT escape sequences from text captured from subprocesses.
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
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function escapeTags(value: string): string {
  return value.replace(/\{/gu, "\\{").replace(/\}/gu, "\\}");
}

function applyMarkdown(raw: string): string {
  try {
    const lines = raw.split("\n");
    let inFence = false;

    return lines
      .map((rawLine) => {
        // Fenced code block toggle — check raw line before escaping.
        if (/^```/.test(rawLine)) {
          inFence = !inFence;
          return `{#555555-fg}${rawLine.replace(/\{/g, "\\{").replace(/\}/g, "\\}")}{/}`;
        }
        if (inFence) {
          return `{#999999-fg}${rawLine.replace(/\{/g, "\\{").replace(/\}/g, "\\}")}{/}`;
        }

        // Escape blessed delimiters on this line.
        let line = rawLine.replace(/\{/g, "\\{").replace(/\}/g, "\\}");

        // Markdown header (# / ## / ###).
        const headerMatch = /^(#{1,3}) (.+)$/.exec(rawLine);
        if (headerMatch) {
          const title = (headerMatch[2] ?? "").replace(/\{/g, "\\{").replace(/\}/g, "\\}");
          return (headerMatch[1] ?? "").length === 1
            ? `{bold}{underline}${title}{/underline}{/bold}`
            : `{bold}${title}{/bold}`;
        }

        // Bold: **text** — process before italic so ** is consumed first.
        line = line.replace(/\*\*([^*\n]+?)\*\*/g, (_, t: string) => `{bold}${t}{/bold}`);

        // Italic: *text* — at this point all ** have been consumed above.
        // Require non-space after opening * to avoid bullet list items (* item).
        line = line.replace(/\*([^ *\n][^*\n]*?)\*/g, (_, t: string) => `{underline}${t}{/underline}`);

        // Inline code: `code`
        line = line.replace(/`([^`\n]+)`/g, (_, t: string) => `{#7ec8e3-fg}${t}{/}`);

        return line;
      })
      .join("\n");
  } catch {
    // Fallback: return safely escaped plain text so rendering never breaks.
    return raw.replace(/\{/g, "\\{").replace(/\}/g, "\\}");
  }
}

function getCommandSuggestions(input: string): CommandDefinition[] {
  if (!input.startsWith("/")) {
    return [];
  }

  const query = input.slice(1).trim().toLowerCase();
  if (query.length === 0) {
    return allCommands.slice(0, 4);
  }

  return [...allCommands]
    .filter((command) => {
      const haystack =
        `${command.name} ${command.usage} ${command.description}`.toLowerCase();
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
  if (normalized.length === 0) {
    return;
  }

  entries.push({
    id: nextId(),
    tone,
    text: normalized,
    time: timestamp(),
  });
}

function chipForTone(tone: EntryTone): string {
  switch (tone) {
    case "command":
      return "{#ffffff-fg}[you]{/}";
    case "stderr":
      return "{#cc5555-fg}[err]{/}";
    case "stdout":
      return "{#999999-fg}[out]{/}";
    case "partial":
      return "{#e8e8e8-fg}[ai]{/}";
    case "system":
    default:
      return "{#666666-fg}[—]{/}";
  }
}

function colorForTone(tone: EntryTone): string {
  switch (tone) {
    case "command":
      return "#ffffff-fg";
    case "stderr":
      return "#cc5555-fg";
    case "stdout":
      return "#b0b0b0-fg";
    case "partial":
      return "#e8e8e8-fg";
    case "system":
    default:
      return "#909090-fg";
  }
}

function renderEntry(entry: LogEntry): string {
  const timeTag = `{#606060-fg}[${entry.time}]{/}`;
  const chip = chipForTone(entry.tone);
  const color = colorForTone(entry.tone);
  const isPartial = entry.tone === "partial";

  // AI responses: apply markdown rendering and use a small indent so the AI's
  // own indentation (code blocks, lists) doesn't stack with a large prefix.
  // Other tones: escape tags only, keep 18-space alignment with the chip width.
  const continuationIndent = isPartial ? "  " : " ".repeat(18);
  const lines = isPartial
    ? applyMarkdown(entry.text).split("\n")
    : entry.text.split("\n").map((line) => escapeTags(stripAnsi(line)));

  return lines
    .map((line, index) => {
      if (index === 0) {
        return `${timeTag} ${chip} {${color}}${line}{/}`;
      }
      return `${continuationIndent}{${color}}${line}{/}`;
    })
    .join("\n");
}

function renderTranscript(entries: LogEntry[]): string {
  return entries.map((entry) => renderEntry(entry)).join("\n\n");
}

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

  const background = blessed.box({
    parent: screen,
    width: "100%",
    height: "100%",
    style: { bg: "black" },
  });

  const shell = blessed.box({
    parent: background,
    top: "center",
    left: "center",
    width: "88%",
    height: "90%",
    border: "line",
    style: {
      border: { fg: "#2e2e2e" },
      bg: "black",
    },
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
    top: 0,
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
    top: WORDMARK.length + 1,
    left: logoWidth + 4,
    right: 0,
    height: 3,
    tags: true,
    style: { fg: "gray" },
  });

  const transcriptBox = blessed.box({
    parent: shell,
    top: 16,
    left: 2,
    right: 2,
    bottom: 7,
    label: " conversation ",
    border: "line",
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    keys: false,
    vi: false,
    tags: true,
    wrap: true,
    padding: {
      left: 1,
      right: 1,
    },
    scrollbar: {
      ch: "▐",
      track: { bg: "black" },
      style: { bg: "#404040" },
    },
    style: {
      fg: "#c8c8c8",
      border: { fg: "#333333" },
      label: { fg: "#555555" },
    },
  });

  const inputBox = blessed.textbox({
    parent: shell,
    bottom: 3,
    left: 2,
    right: 2,
    height: 3,
    inputOnFocus: true,
    mouse: true,
    keys: true,
    border: "line",
    label: " prompt ",
    style: {
      border: { fg: "#606060" },
      label: { fg: "#888888" },
      fg: "white",
    },
  });

  const statusBox = blessed.box({
    parent: shell,
    bottom: 1,
    left: 2,
    right: 2,
    height: 1,
    tags: true,
    style: { fg: "#404040" },
  });

  let snapshot: SessionSnapshot = store.getSnapshot();
  const entries: LogEntry[] = [];
  let statusLine = "ready";
  let busy = false;
  let historyIndex: number | null = null;
  let inputBeforeHistory = "";
  let autoScroll = true;
  let destroyed = false;
  let frameIndex = 0;

  pushEntry(
    entries,
    "system",
    `crsr ready — workspace: ${contractHome(store.getSnapshot().activeWorkspace ?? os.homedir())}\nType a prompt or /help for commands.`,
  );

  function refreshSnapshot(): void {
    snapshot = store.getSnapshot();
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

  function buildMetaLines(width: number): string {
    const rawWorkspace =
      snapshot.activeWorkspace ?? config.workspace ?? os.homedir();
    const contracted = contractHome(rawWorkspace);
    const shortWorkspace = shorten(contracted, Math.max(24, width - 12));
    const model = snapshot.model ?? "default";
    const mode = snapshot.mode;
    const force = snapshot.forceMode ? "on" : "off";

    return [
      `{#505050-fg}workspace{/} {#a0a0a0-fg}${escapeTags(shortWorkspace)}{/}`,
      `{#505050-fg}model{/} {#a0a0a0-fg}${escapeTags(model)}{/}   {#505050-fg}mode{/} {#a0a0a0-fg}${escapeTags(mode)}{/}   {#505050-fg}force{/} {#a0a0a0-fg}${escapeTags(force)}{/}`,
    ].join("\n");
  }

  function buildStatusLine(width: number): string {
    const input = getInputValue();
    const suggestions = getCommandSuggestions(input);

    if (busy) {
      return shorten(
        `running  ${statusLine.replace(/^\$ cursor-agent\s+/u, "")}`,
        width,
      );
    }

    if (input.startsWith("/") && suggestions.length > 0) {
      return shorten(
        `tab  ${suggestions.map((command) => command.usage).join("   ")}`,
        width,
      );
    }

    if (input.startsWith("!")) {
      return shorten(
        "shell mode   enter run command in active workspace   use cd && ... to change directories",
        width,
      );
    }

    return shorten(
      "enter run   !cmd shell mode   ↑↓ history   pgup/pgdn scroll   tab complete   ctrl+l clear   ctrl+c quit",
      width,
    );
  }

  function renderUi(): void {
    if (destroyed) {
      return;
    }

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
    transcriptBox.height = Math.max(8, shellHeight - heroHeight - 9);

    if (wideLayout) {
      logoBox.top = 0;
      logoBox.left = 0;
      brandBox.top = 0;
      brandBox.left = logoWidth + 4;
      brandBox.right = 0;
      brandBox.height = WORDMARK.length;
      metaBox.top = WORDMARK.length + 1;
      metaBox.left = logoWidth + 4;
      metaBox.right = 0;
    } else {
      logoBox.top = 0;
      logoBox.left = 0;
      brandBox.top = 0;
      brandBox.left = logoWidth + 4;
      brandBox.right = 0;
      brandBox.height = WORDMARK.length;
      metaBox.top = WORDMARK.length + 1;
      metaBox.left = logoWidth + 4;
      metaBox.right = 0;
    }

    const currentFrame = normalizedFrameLines[frameIndex] ?? normalizedFrameLines[0]!;
    logoBox.setContent(renderLogoFrame(currentFrame));
    brandBox.setContent(
      `{#e8e8e8-fg}${WORDMARK.join("\n")}{/}`,
    );
    metaBox.setContent(buildMetaLines(metaWidth));
    transcriptBox.setContent(renderTranscript(entries));
    statusBox.setContent(buildStatusLine(Math.max(40, shellWidth - 8)));
    const promptValue = getInputValue().trimStart();
    const inputLabel = busy ? " running " : promptValue.startsWith("!") ? " shell " : " prompt ";
    inputBox.setLabel(inputLabel);

    if (autoScroll) {
      transcriptBox.setScrollPerc(100);
    } else {
      transcriptBox.setScroll(currentScroll);
    }

    screen.render();
  }

  async function submitCommand(rawCommand: string): Promise<void> {
    const trimmed = rawCommand.trim();
    if (trimmed.length === 0 || busy) {
      return;
    }

    clearInputValue();
    historyIndex = null;
    inputBeforeHistory = "";
    autoScroll = true;
    pushEntry(entries, "command", trimmed);
    renderUi();

    try {
      const outcome = await router.routeInput(trimmed);
      refreshSnapshot();

      if (outcome.kind === "noop") {
        renderUi();
        return;
      }

      if (outcome.kind === "exit") {
        destroy();
        return;
      }

      if (outcome.kind === "clear") {
        entries.length = 0;
        pushEntry(entries, "system", "output cleared");
        statusLine = "cleared";
        transcriptBox.scrollTo(0);
        renderUi();
        return;
      }

      if (outcome.kind === "message") {
        pushEntry(entries, "system", `${outcome.title}\n${outcome.body}`);
        statusLine = outcome.title.toLowerCase();
        renderUi();
        return;
      }

      busy = true;
      statusLine = outcome.label;
      const partialEntryId = nextId();
      let partialCreated = false;

      const emitEvent = (event: StreamEvent): void => {
        switch (event.type) {
          case "status":
            statusLine = event.message;
            renderUi();
            break;
          case "stderr":
            pushEntry(entries, "stderr", stripAnsi(event.text));
            renderUi();
            break;
          case "stdout":
            pushEntry(entries, "stdout", stripAnsi(event.text));
            renderUi();
            break;
          case "partial": {
            const clean = stripAnsi(event.text);
            if (!partialCreated) {
              partialCreated = true;
              entries.push({
                id: partialEntryId,
                tone: "partial",
                text: clean,
                time: timestamp(),
              });
            } else {
              const partialEntry = entries.find((entry) => entry.id === partialEntryId);
              if (partialEntry) {
                partialEntry.text += clean;
              }
            }
            renderUi();
            break;
          }
          case "json":
            // Raw JSON events carry no new visible content — skip the re-render.
            break;
        }
      };

      const result = await outcome.execute(emitEvent);
      pushEntry(entries, "system", renderCommandResult(result));
      statusLine = result.exitCode === 0 ? "ready" : `exit ${result.exitCode}`;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown wrapper error";
      pushEntry(entries, "stderr", message);
      statusLine = "error";
    } finally {
      busy = false;
      refreshSnapshot();
      renderUi();
      inputBox.focus();
    }
  }

  const animationTimer = setInterval(() => {
    frameIndex = (frameIndex + 1) % normalizedFrameLines.length;
    renderUi();
  }, 140);

  function destroy(): void {
    if (destroyed) {
      return;
    }

    destroyed = true;
    clearInterval(animationTimer);
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
      const message =
        error instanceof Error ? error.message : "Unknown screen cleanup error";
      process.stderr.write(`crsr cleanup warning: ${message}\n`);
      (screen as blessed.Widgets.Screen & { emit: (event: string) => boolean }).emit(
        "destroy",
      );
    }
  }

  screen.on("resize", () => {
    renderUi();
  });

  screen.key(["C-c"], () => {
    destroy();
  });

  screen.key(["C-l"], () => {
    entries.length = 0;
    pushEntry(entries, "system", "cleared");
    transcriptBox.scrollTo(0);
    autoScroll = true;
    renderUi();
  });

  inputBox.key(["C-u"], () => {
    clearInputValue();
    historyIndex = null;
    inputBeforeHistory = "";
    renderUi();
    return false;
  });

  screen.key(["pageup"], () => {
    autoScroll = false;
    transcriptBox.scroll(-5);
    screen.render();
  });

  screen.key(["pagedown"], () => {
    transcriptBox.scroll(5);
    if (transcriptBox.getScrollPerc() >= 99) {
      autoScroll = true;
    }
    screen.render();
  });

  screen.on("wheelup", () => {
    autoScroll = false;
    transcriptBox.scroll(-1);
    screen.render();
  });

  screen.on("wheeldown", () => {
    transcriptBox.scroll(1);
    if (transcriptBox.getScrollPerc() >= 99) {
      autoScroll = true;
    }
    screen.render();
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
    clearInputValue();
    historyIndex = null;
    inputBeforeHistory = "";
    renderUi();
    return false;
  });

  inputBox.key("up", () => {
    if (busy || snapshot.commandHistory.length === 0) {
      return false;
    }

    if (historyIndex === null) {
      inputBeforeHistory = getInputValue();
      historyIndex = 0;
    } else {
      historyIndex = Math.min(
        historyIndex + 1,
        snapshot.commandHistory.length - 1,
      );
    }

    setInputValue(snapshot.commandHistory[historyIndex] ?? inputBeforeHistory);
    renderUi();
    return false;
  });

  inputBox.key("down", () => {
    if (historyIndex === null) {
      return false;
    }

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

  inputBox.on("keypress", () => {
    setImmediate(renderUi);
  });

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
