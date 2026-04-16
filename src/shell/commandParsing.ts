export type TokenizeCommandResult =
  | { ok: true; tokens: string[] }
  | { ok: false; message: string };

export type WorktreeArgsResult =
  | { ok: true; args: string[] }
  | { ok: false; message: string };

function isEscapableCharacter(character: string | undefined): boolean {
  return (
    character === "\\" ||
    character === "'" ||
    character === '"' ||
    Boolean(character && /\s/u.test(character))
  );
}

export function tokenizeCommandInput(input: string): TokenizeCommandResult {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  const flush = (): void => {
    if (current.length > 0) {
      tokens.push(current);
      current = "";
    }
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    const next = input[index + 1];

    if (!quote && /\s/u.test(character)) {
      flush();
      continue;
    }

    if (character === "\\") {
      if (isEscapableCharacter(next)) {
        current += next!;
        index += 1;
      } else {
        current += "\\";
      }
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    current += character;
  }

  if (quote) {
    return {
      ok: false,
      message: `Unterminated ${quote === '"' ? "double" : "single"} quote.`,
    };
  }

  flush();
  return { ok: true, tokens };
}

export function tokenizeSlashCommand(input: string): string[] {
  const parsed = tokenizeCommandInput(input);
  return parsed.ok ? parsed.tokens : [];
}

export type SlashParseSuccess = {
  ok: true;
  command: string;
  args: string[];
  meta?: { delegateArgs: string[] };
};

export type SlashParseResult =
  | SlashParseSuccess
  | { ok: false; message: string };

export type WorktreeDelegatePlan = { delegateArgs: string[] };

export function buildWorktreeDelegateArgs(args: string[]): WorktreeArgsResult {
  const worktreeArgs: string[] = ["-w"];
  const remainingArgs = [...args];

  const baseIndex = remainingArgs.indexOf("--base");
  let baseBranch: string | null = null;
  if (baseIndex !== -1) {
    const candidate = remainingArgs[baseIndex + 1] ?? null;
    if (!candidate || candidate.startsWith("-")) {
      return {
        ok: false,
        message: "Usage: /worktree [name] [--base <branch>] [--skip-setup]",
      };
    }
    baseBranch = candidate;
    remainingArgs.splice(baseIndex, 2);
  }

  const skipSetup = remainingArgs.includes("--skip-setup");
  const filteredArgs = remainingArgs.filter((value) => value !== "--skip-setup");

  if (filteredArgs.length > 0) {
    worktreeArgs.push(filteredArgs.join(" "));
  }

  if (baseBranch) {
    worktreeArgs.push("--worktree-base", baseBranch);
  }

  if (skipSetup) {
    worktreeArgs.push("--skip-worktree-setup");
  }

  return { ok: true, args: worktreeArgs };
}

export function parseSlashInput(input: string): SlashParseResult {
  const parsedTokens = tokenizeCommandInput(input.trim());
  if (!parsedTokens.ok) {
    return {
      ok: false,
      message: "Unterminated quote in slash command. Close the quote and try again.",
    };
  }

  if (parsedTokens.tokens.length === 0) {
    return {
      ok: false,
      message: "Type a command after '/'. Run /help to see available commands.",
    };
  }

  const [command, ...args] = parsedTokens.tokens;
  if (command === "worktree") {
    const worktreeArgs = buildWorktreeDelegateArgs(args);
    if (!worktreeArgs.ok) {
      return { ok: false, message: worktreeArgs.message };
    }

    return {
      ok: true,
      command,
      args,
      meta: { delegateArgs: worktreeArgs.args },
    };
  }

  return { ok: true, command, args };
}
