import { allCommands } from "./runtime/commandCatalog.js";

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

const reservedOptionTokens = new Set([
  "--",
  "--help",
  "-h",
  "--once",
  "--update",
  "--version",
  "-v",
  "--workspace",
]);

function isReservedOptionToken(value: string | undefined): boolean {
  return typeof value === "string" && reservedOptionTokens.has(value);
}

export function parseCliArguments(argv: string[]): CliParseResult {
  const options: CliOptions = { oneShot: false, update: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") return { kind: "help" };
    if (token === "--version" || token === "-v") return { kind: "version" };

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
      const nextToken = argv[index + 1];
      if (!nextToken || isReservedOptionToken(nextToken)) {
        return {
          kind: "error",
          message: "--workspace requires a path value.",
        };
      }
      options.workspace = nextToken;
      index += 1;
      continue;
    }

    if (token.startsWith("--workspace=")) {
      const value = token.slice("--workspace=".length).trim();
      if (value.length === 0) {
        return {
          kind: "error",
          message: "--workspace requires a path value.",
        };
      }
      options.workspace = value;
      continue;
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
