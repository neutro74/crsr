export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  const pushCurrent = (): void => {
    if (current.length > 0) {
      tokens.push(current);
      current = "";
    }
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;

    if (quote === "'") {
      if (character === "'") {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }

    if (quote === '"') {
      if (character === '"') {
        quote = null;
        continue;
      }

      if (character === "\\") {
        const nextCharacter = input[index + 1];
        if (nextCharacter === "\\" || nextCharacter === '"') {
          current += nextCharacter;
          index += 1;
          continue;
        }
      }

      current += character;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === "\\") {
      const nextCharacter = input[index + 1];
      if (
        nextCharacter !== undefined &&
        (/\s/u.test(nextCharacter) || nextCharacter === "\\" || nextCharacter === '"' || nextCharacter === "'")
      ) {
        current += nextCharacter;
        index += 1;
      } else {
        current += character;
      }
      continue;
    }

    if (/\s/u.test(character)) {
      pushCurrent();
      continue;
    }

    current += character;
  }

  if (quote) {
    throw new Error(`Unterminated ${quote === '"' ? "double" : "single"} quote in command.`);
  }

  pushCurrent();
  return tokens;
}
