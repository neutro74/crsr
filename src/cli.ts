import { allCommands } from "./runtime/commandCatalog.js";

export interface CliOptions {
  initialCommand?: string;
  oneShot: boolean;
  update: boolean;
  workspace?: string;
}

export interface CliParseError {
  kind: "error";
  message: string;
}

export type CliParseResult = CliOptions | CliParseError | "help" | "version";

export function parseCliArguments(argv: string[]): CliParseResult {
  const options: CliOptions = { oneShot: false, update: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--") {
      const remainder = argv.slice(index + 1).join(" ").trim();
      options.initialCommand = remainder.length > 0 ? remainder : undefined;
      break;
    }

    if (token === "--help" || token === "-h") {
      return "help";
    }

    if (token === "--version" || token === "-v") {
      return "version";
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
      if (!workspace) {
        return {
          kind: "error",
          message: "--workspace requires a path.",
        };
      }

      options.workspace = workspace;
      index += 1;
      continue;
    }

    options.initialCommand = argv.slice(index).join(" ");
    break;
  }

  if (options.update && (options.oneShot || options.workspace || options.initialCommand)) {
    return {
      kind: "error",
      message: "--update cannot be combined with --once, --workspace, or an initial command.",
    };
  }

  return options;
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
  const knownNames = new Set([
    ...allCommands.map((command) => command.name.split(" ")[0]),
    "mcp",
  ]);

  return knownNames.has(firstToken) ? `/${initialCommand}` : initialCommand;
}
