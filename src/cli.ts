import { allCommands } from "./runtime/commandCatalog.js";

export interface CliOptions {
  initialCommand?: string;
  oneShot: boolean;
  update: boolean;
  workspace?: string;
}

const knownOptionTokens = new Set([
  "--help",
  "-h",
  "--version",
  "-v",
  "--once",
  "--update",
  "--workspace",
  "--",
]);

const exactAutoPrefixCommands = new Set(
  allCommands.map((command) => command.name.toLowerCase()),
);

export function parseCliArguments(
  argv: string[],
): CliOptions | "help" | "version" {
  const options: CliOptions = { oneShot: false, update: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
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
      const candidate = argv[index + 1];
      if (!candidate || knownOptionTokens.has(candidate)) {
        throw new Error("--workspace requires a path argument.");
      }
      options.workspace = candidate;
      index += 1;
      continue;
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

  const canonical = trimmed.toLowerCase().replace(/\s+/gu, " ");
  return exactAutoPrefixCommands.has(canonical) ? `/${trimmed}` : trimmed;
}
