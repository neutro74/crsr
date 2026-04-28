import { allCommands } from "./runtime/commandCatalog.js";
import { APP_NAME, APP_VERSION } from "./version.js";

export interface CliOptions {
  initialCommand?: string;
  oneShot: boolean;
  update: boolean;
  workspace?: string;
}

export class CliParseError extends Error {}

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
`;
}

export function renderVersion(): string {
  return `${APP_NAME} ${APP_VERSION}`;
}

export function parseCliArguments(
  argv: string[],
): CliOptions | "help" | "version" {
  const options: CliOptions = { oneShot: false, update: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") return "help";
    if (token === "--version" || token === "-v") return "version";

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
      if (!workspace || workspace === "--") {
        throw new CliParseError("--workspace requires a path.");
      }
      options.workspace = workspace;
      index += 1;
      continue;
    }

    if (token === "--") {
      const remaining = argv.slice(index + 1).join(" ").trim();
      if (remaining.length > 0) {
        options.initialCommand = remaining;
      }
      break;
    }

    options.initialCommand = argv.slice(index).join(" ");
    break;
  }

  return options;
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
