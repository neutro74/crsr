import { allCommands } from "./runtime/commandCatalog.js";
import { APP_NAME, APP_VERSION } from "./version.js";

export interface CliOptions {
  initialCommand?: string;
  oneShot: boolean;
  update: boolean;
  workspace?: string;
}

export type ParsedCliArguments =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string }
  | { kind: "run"; options: CliOptions };

const knownCommandNames = new Set([
  ...allCommands.map((command) => command.name.split(" ")[0]),
  "mcp",
]);

export function renderHelp(): string {
  return `crsr - terminal wrapper for cursor-agent

Usage:
  crsr [options] [initial command or prompt...]
  crsr [options] -- [initial command or prompt...]

Options:
  --workspace <path>  Set the workspace for delegated commands
  --once              Run the initial command once and exit (headless)
  --update            Download and replace this binary from GitHub releases
  -h, --help          Show this help message
  -v, --version       Show the version

Interactive commands start with /. Plain text sends a prompt.
Use -- to pass a prompt or command that starts with -.
Run 'crsr --once /help' to see all interactive commands.
`;
}

export function renderVersion(): string {
  return `${APP_NAME} ${APP_VERSION}`;
}

function parseWorkspaceValue(
  argv: string[],
  index: number,
): { workspace: string; nextIndex: number } | { message: string } {
  const token = argv[index];
  if (!token) {
    return { message: "--workspace requires a path." };
  }

  const inlinePrefix = "--workspace=";
  if (token.startsWith(inlinePrefix)) {
    const workspace = token.slice(inlinePrefix.length).trim();
    if (workspace.length === 0) {
      return { message: "--workspace requires a path." };
    }
    return { workspace, nextIndex: index };
  }

  const workspace = argv[index + 1]?.trim();
  if (!workspace || workspace === "--" || workspace.startsWith("-")) {
    return { message: "--workspace requires a path." };
  }

  return { workspace, nextIndex: index + 1 };
}

export function parseCliArguments(argv: string[]): ParsedCliArguments {
  const options: CliOptions = { oneShot: false, update: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    if (token === "--") {
      const remainder = argv.slice(index + 1).join(" ").trim();
      return {
        kind: "run",
        options: {
          ...options,
          initialCommand: remainder.length > 0 ? remainder : undefined,
        },
      };
    }

    if (token === "--help" || token === "-h") {
      return { kind: "help" };
    }

    if (token === "--version" || token === "-v") {
      return { kind: "version" };
    }

    if (token === "--once") {
      options.oneShot = true;
      continue;
    }

    if (token === "--update") {
      options.update = true;
      continue;
    }

    if (token === "--workspace" || token.startsWith("--workspace=")) {
      const result = parseWorkspaceValue(argv, index);
      if ("message" in result) {
        return { kind: "error", message: result.message };
      }
      options.workspace = result.workspace;
      index = result.nextIndex;
      continue;
    }

    if (token.startsWith("-")) {
      return {
        kind: "error",
        message: `Unknown option "${token}". Use -- to pass a prompt or command that starts with -.`,
      };
    }

    return {
      kind: "run",
      options: {
        ...options,
        initialCommand: argv.slice(index).join(" "),
      },
    };
  }

  return { kind: "run", options };
}

export function normalizeInitialCommand(
  initialCommand: string | undefined,
): string | undefined {
  if (!initialCommand) {
    return undefined;
  }

  if (initialCommand.startsWith("/")) {
    return initialCommand;
  }

  const firstToken = initialCommand.trim().split(/\s+/u)[0];
  return knownCommandNames.has(firstToken) ? `/${initialCommand}` : initialCommand;
}
