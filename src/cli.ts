import { allCommands } from "./runtime/commandCatalog.js";

export interface CliOptions {
  initialCommand?: string;
  oneShot: boolean;
  update: boolean;
  workspace?: string;
}

export type ParsedCliArguments =
  | { kind: "options"; options: CliOptions }
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string };

function isLikelyOptionToken(token: string | undefined): boolean {
  return typeof token === "string" && token.startsWith("-");
}

export function parseCliArguments(argv: string[]): ParsedCliArguments {
  const options: CliOptions = { oneShot: false, update: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") {
      const remainder = argv.slice(index + 1).join(" ");
      if (remainder.length > 0) {
        options.initialCommand = remainder;
      }
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
      if (!workspace || workspace.trim().length === 0 || isLikelyOptionToken(workspace)) {
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
    return { kind: "options", options };
  }

  return { kind: "options", options };
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
