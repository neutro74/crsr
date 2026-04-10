export interface CliOptions {
  initialCommand?: string;
  oneShot: boolean;
  update: boolean;
  workspace?: string;
}

export type CliParseResult =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string }
  | { kind: "options"; options: CliOptions };

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

    if (token.startsWith("--workspace=")) {
      const workspace = token.slice("--workspace=".length);
      if (!workspace) {
        return {
          kind: "error",
          message: "--workspace requires a non-empty path.",
        };
      }
      options.workspace = workspace;
      continue;
    }

    if (token === "--workspace") {
      const workspace = argv[index + 1];
      if (!workspace || workspace.startsWith("-")) {
        return {
          kind: "error",
          message:
            "--workspace requires a path. Use --workspace <path> or --workspace=<path>.",
        };
      }
      options.workspace = workspace;
      index += 1;
      continue;
    }

    options.initialCommand = argv.slice(index).join(" ");
    break;
  }

  return { kind: "options", options };
}
