import { allCommands } from "./runtime/commandCatalog.js";

export interface CliOptions {
  initialCommand?: string;
  oneShot: boolean;
  update: boolean;
  workspace?: string;
}

export type CliParseResult =
  | { kind: "options"; options: CliOptions }
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string };

export function parseCliArguments(argv: string[]): CliParseResult {
  const options: CliOptions = { oneShot: false, update: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--") {
      const remainder = argv.slice(index + 1).join(" ");
      options.initialCommand = remainder.length > 0 ? remainder : undefined;
      return { kind: "options", options };
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
      if (!workspace || workspace.trim().length === 0) {
        return {
          kind: "error",
          message: "--workspace requires a path value.",
        };
      }
      options.workspace = workspace;
      index += 1;
      continue;
    }

    if (token?.startsWith("--workspace=")) {
      const workspace = token.slice("--workspace=".length);
      if (workspace.trim().length === 0) {
        return {
          kind: "error",
          message: "--workspace requires a path value.",
        };
      }
      options.workspace = workspace;
      continue;
    }

    if (token?.startsWith("-")) {
      return {
        kind: "error",
        message: `Unknown option "${token}". Use -- to pass a prompt beginning with "-".`,
      };
    }

    options.initialCommand = argv.slice(index).join(" ");
    return { kind: "options", options };
  }

  return { kind: "options", options };
}

export function normalizeInitialCommand(
  initialCommand: string | undefined,
): string | undefined {
  const trimmed = initialCommand?.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("/")) return trimmed;

  const firstToken = trimmed.split(/\s+/u)[0] ?? "";
  const knownNames = new Set([
    ...allCommands.map((command) => command.name.split(" ")[0]),
    "mcp",
  ]);

  return knownNames.has(firstToken) ? `/${trimmed}` : trimmed;
}
