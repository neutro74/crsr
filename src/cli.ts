import { allCommands } from "./runtime/commandCatalog.js";

export interface CliOptions {
  initialCommand?: string;
  oneShot: boolean;
  update: boolean;
  workspace?: string;
}

export type CliParseResult =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string }
  | { kind: "run"; options: CliOptions };

export function renderHelpText(): string {
  return `crsr - terminal wrapper for cursor-agent

Usage:
  crsr [options] [initial command or prompt...]

Options:
  --workspace <path>  Set the workspace for delegated commands
  --once              Run the initial command once and exit (headless)
  --update            Download and replace this binary from GitHub releases
  -h, --help          Show this help message
  -v, --version       Show the version
  --                  Treat remaining arguments as the initial prompt

Interactive commands start with /. Plain text sends a prompt.
Run 'crsr --once /help' to see all interactive commands.
`;
}

export function parseCliArguments(argv: string[]): CliParseResult {
  const options: CliOptions = { oneShot: false, update: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;

    if (token === "--") {
      options.initialCommand = argv.slice(index + 1).join(" ");
      break;
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
      const nextToken = argv[index + 1];
      if (!nextToken || nextToken.startsWith("-")) {
        return {
          kind: "error",
          message:
            "--workspace requires a path. Use --workspace <path> or --workspace=<path>.",
        };
      }
      options.workspace = nextToken;
      index += 1;
      continue;
    }

    if (token.startsWith("--workspace=")) {
      const workspace = token.slice("--workspace=".length).trim();
      if (workspace.length === 0) {
        return {
          kind: "error",
          message:
            "--workspace requires a path. Use --workspace <path> or --workspace=<path>.",
        };
      }
      options.workspace = workspace;
      continue;
    }

    if (token.startsWith("-")) {
      return {
        kind: "error",
        message: `Unknown option "${token}". Use -- to pass a prompt that starts with -.`,
      };
    }

    options.initialCommand = argv.slice(index).join(" ");
    break;
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
