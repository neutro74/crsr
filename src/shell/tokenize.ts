export type TokenizeResult =
  | { tokens: string[] }
  | { error: string };

function isWhitespace(value: string): boolean {
  return /\s/u.test(value);
}

function canEscapeOutsideQuotes(nextCharacter: string | undefined): boolean {
  return (
    nextCharacter !== undefined &&
    (isWhitespace(nextCharacter) ||
      nextCharacter === '"' ||
      nextCharacter === "'" ||
      nextCharacter === "\\")
  );
}

function canEscapeInsideQuotes(
  nextCharacter: string | undefined,
  quote: '"' | "'",
): boolean {
  return nextCharacter === quote || nextCharacter === "\\";
}

export function tokenizeCommandInput(input: string): TokenizeResult {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;

  const trimmed = input.trim();
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index]!;
    const nextCharacter = trimmed[index + 1];

    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }

    if (character === "\\") {
      const canEscape = quote
        ? canEscapeInsideQuotes(nextCharacter, quote)
        : canEscapeOutsideQuotes(nextCharacter);
      if (canEscape) {
        escaping = true;
      } else {
        current += character;
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

    if (isWhitespace(character)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += character;
  }

  if (escaping) {
    current += "\\";
  }

  if (quote) {
    return {
      error: `Unterminated quoted string. Close the ${quote} quote and try again.`,
    };
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return { tokens };
}
