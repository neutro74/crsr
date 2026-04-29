import { allCommands } from "./runtime/commandCatalog.js";
import { APP_NAME, APP_VERSION } from "./version.js";

export interface CliOptions {
  initialCommand?: string;
  oneShot: boolean;
  update: boolean;
  workspace?: string;
}

export type CliParseResult =
  | { kind: "run"; options: CliOptions }
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string };

export function renderHelp(): string {
  return `crsr - terminal wrapper for cursor-agent

Usage:
  crsr [options] [initial command or prompt...]

Options:
  --workspace <path>  Set the workspace for delegated commands
  --once              Run the initial command once and exit (headless)
  --update            Download and replace this binary from GitHub releases
  -h, --help          Show this help message
  -v, --version       Show the version

Interactive commands start with /. Plain text sends a prompt.
Run 'crsr --once /help' to see all interactive commands.
Use '--' before a prompt that starts with '-'.
`;
}

export function renderVersion(): string {
  return `${APP_NAME} ${APP_VERSION}`;
}

export function parseCliArguments(argv: string[]): CliParseResult {
  const options: CliOptions = { oneShot: false, update: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    if (token === "--") {
      options.initialCommand = argv.slice(index + 1).join(" ");
      return { kind: "run", options };
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

    if (token === "--workspace") {
      const workspace = argv[index + 1];
      if (!workspace || workspace === "--" || workspace.startsWith("-")) {
        return {
          kind: "error",
          message:
            "--workspace requires a path. Use '-- --workspace' if your prompt starts with a dash.",
        };
      }

      options.workspace = workspace;
      index += 1;
      continue;
    }

    if (token.startsWith("-")) {
      return {
        kind: "error",
        message:
          `Unknown option "${token}". Run 'crsr --help' for usage, or use '--' before a prompt that starts with a dash.`,
      };
    }

    options.initialCommand = argv.slice(index).join(" ");
    return { kind: "run", options };
  }

  return { kind: "run", options };
}

export function normalizeInitialCommand(
  initialCommand: string | undefined,
): string | undefined {
  if (!initialCommand) return undefined;
  if (initialCommand.startsWith("/")) return initialCommand;

  const firstToken = initialCommand.trim().split(/\s+/u)[0];
  const knownNames = new Set([
    ...allCommands.map((command) => command.name.split(" ")[0]),
    "mcp",
  ]);

  return knownNames.has(firstToken) ? `/${initialCommand}` : initialCommand;
}
