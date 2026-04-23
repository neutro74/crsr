import { allCommands } from "./runtime/commandCatalog.js";

export interface CliOptions {
  initialCommand?: string;
  oneShot: boolean;
  update: boolean;
  workspace?: string;
}

export type CliParseResult =
  | CliOptions
  | "help"
  | "version"
  | { kind: "error"; message: string };

export function isCliParseError(
  value: CliParseResult,
): value is { kind: "error"; message: string } {
  return typeof value === "object" && value !== null && "kind" in value;
}

function parseWorkspaceValue(rawValue: string | undefined): string | null {
  if (!rawValue || rawValue === "--" || rawValue.startsWith("-")) {
    return null;
  }

  const value = rawValue.trim();
  return value.length > 0 ? value : null;
}

export function parseCliArguments(argv: string[]): CliParseResult {
  const options: CliOptions = { oneShot: false, update: false };
  const commandParts: string[] = [];
  let parsingOptions = true;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    const hasCommand = commandParts.length > 0;

    if (!parsingOptions) {
      commandParts.push(token);
      continue;
    }

    if (token === "--") {
      parsingOptions = false;
      continue;
    }

    if (!hasCommand && (token === "--help" || token === "-h")) return "help";
    if (!hasCommand && (token === "--version" || token === "-v")) return "version";

    if (token === "--once") {
      options.oneShot = true;
      continue;
    }

    if (token === "--update") {
      options.update = true;
      continue;
    }

    if (token === "--workspace") {
      const workspace = parseWorkspaceValue(argv[index + 1]);
      if (!workspace) {
        return {
          kind: "error",
          message:
            "--workspace requires a path value. Example: crsr --workspace ~/project",
        };
      }
      options.workspace = workspace;
      index += 1;
      continue;
    }

    if (token.startsWith("--workspace=")) {
      const workspace = parseWorkspaceValue(token.slice("--workspace=".length));
      if (!workspace) {
        return {
          kind: "error",
          message:
            "--workspace requires a path value. Example: crsr --workspace ~/project",
        };
      }
      options.workspace = workspace;
      continue;
    }

    if (token.startsWith("-")) {
      if (hasCommand) {
        commandParts.push(token);
        continue;
      }
      return {
        kind: "error",
        message:
          `Unknown option "${token}". Use -- to pass a leading-dash prompt literally.`,
      };
    }

    commandParts.push(token);
  }

  if (commandParts.length > 0) {
    options.initialCommand = commandParts.join(" ");
  }

  if (options.update && options.oneShot) {
    return {
      kind: "error",
      message: "--update cannot be combined with --once.",
    };
  }

  if (options.update && options.initialCommand) {
    return {
      kind: "error",
      message: "--update does not accept an initial command or prompt.",
    };
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
