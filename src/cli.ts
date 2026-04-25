import { allCommands } from "./runtime/commandCatalog.js";

export interface CliOptions {
  initialCommand?: string;
  oneShot: boolean;
  update: boolean;
  workspace?: string;
}

function isOptionToken(token: string): boolean {
  return token.startsWith("-") && token !== "-";
}

function getKnownCommandNames(): Set<string> {
  return new Set([
    ...allCommands.map((command) => command.name.split(" ")[0] ?? command.name),
    "mcp",
  ]);
}

export function parseCliArguments(
  argv: string[],
): CliOptions | "help" | "version" {
  const options: CliOptions = { oneShot: false, update: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    if (token === "--") {
      options.initialCommand = argv.slice(index + 1).join(" ");
      break;
    }

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
      const value = argv[index + 1];
      if (!value || value === "--" || isOptionToken(value)) {
        throw new Error(
          "--workspace requires a path. Use --workspace=/path or place -- before a prompt that starts with -.",
        );
      }
      options.workspace = value;
      index += 1;
      continue;
    }

    if (token.startsWith("--workspace=")) {
      const value = token.slice("--workspace=".length).trim();
      if (value.length === 0) {
        throw new Error("--workspace requires a non-empty path.");
      }
      options.workspace = value;
      continue;
    }

    if (isOptionToken(token)) {
      throw new Error(
        `Unknown option "${token}". Use -- to treat the remaining arguments as the initial prompt or command.`,
      );
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

  const trimmed = initialCommand.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed.startsWith("/") || trimmed.startsWith("!")) {
    return trimmed;
  }

  const firstToken = trimmed.split(/\s+/u)[0];
  const knownNames = getKnownCommandNames();

  return knownNames.has(firstToken ?? "") ? `/${trimmed}` : trimmed;
}
