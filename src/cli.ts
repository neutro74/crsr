import { allCommands } from "./runtime/commandCatalog.js";

export interface CliOptions {
  initialCommand?: string;
  oneShot: boolean;
  update: boolean;
  workspace?: string;
}

export type CliParseResult = CliOptions | "help" | "version";

function ensureOptionValue(
  argv: string[],
  index: number,
  flagName: string,
): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${flagName} requires a path value.\nExample: crsr ${flagName} /path/to/workspace`);
  }

  return value;
}

export function parseCliArguments(argv: string[]): CliParseResult {
  const options: CliOptions = { oneShot: false, update: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") return "help";
    if (token === "--version" || token === "-v") return "version";

    if (token === "--") {
      options.initialCommand = argv.slice(index + 1).join(" ");
      break;
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
      options.workspace = ensureOptionValue(argv, index, "--workspace");
      index += 1;
      continue;
    }

    if (token === undefined) {
      break;
    }

    if (token.startsWith("-")) {
      throw new Error(`Unknown option: ${token}\nRun 'crsr --help' to see supported flags.`);
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

  if (trimmed.startsWith("/")) return trimmed;

  const firstToken = trimmed.split(/\s+/u)[0];
  const knownNames = new Set([
    ...allCommands.map((command) => command.name.split(" ")[0]),
    "mcp",
  ]);

  return knownNames.has(firstToken) ? `/${trimmed}` : trimmed;
}
