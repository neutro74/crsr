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

const VALUE_REQUIRED_FLAGS = new Set(["--workspace"]);
const KNOWN_FLAGS = new Set([
  "--",
  "--help",
  "-h",
  "--once",
  "--update",
  "--version",
  "-v",
  ...VALUE_REQUIRED_FLAGS,
]);

function isKnownFlag(token: string | undefined): boolean {
  return typeof token === "string" && KNOWN_FLAGS.has(token);
}

export function parseCliArguments(argv: string[]): CliParseResult {
  const options: CliOptions = { oneShot: false, update: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;

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

    if (token.startsWith("--workspace=")) {
      const workspace = token.slice("--workspace=".length).trim();
      if (workspace.length === 0) {
        return {
          kind: "error",
          message: "--workspace requires a path.",
        };
      }
      options.workspace = workspace;
      continue;
    }

    if (token === "--workspace") {
      const workspace = argv[index + 1];
      if (workspace === undefined || isKnownFlag(workspace)) {
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

  return options;
}

export function normalizeInitialCommand(
  initialCommand: string | undefined,
): string | undefined {
  const trimmed = initialCommand?.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("/")) return trimmed;

  const firstToken = trimmed.split(/\s+/u)[0];
  const knownNames = new Set([
    ...allCommands.map((command) => command.name.split(" ")[0]),
    "mcp",
  ]);

  return knownNames.has(firstToken) ? `/${trimmed}` : trimmed;
}
