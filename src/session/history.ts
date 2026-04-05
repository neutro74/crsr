const SENSITIVE_HISTORY_PREFIXES = [
  { prefix: "/api-key ", replacement: "/api-key [REDACTED]" },
  { prefix: "/header add ", replacement: "/header add [REDACTED]" },
] as const;

export function shouldPersistHistoryEntry(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.startsWith("/") || trimmed.startsWith("!");
}

export function sanitizeHistoryEntry(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0 || !shouldPersistHistoryEntry(trimmed)) {
    return null;
  }

  for (const rule of SENSITIVE_HISTORY_PREFIXES) {
    if (trimmed.startsWith(rule.prefix)) {
      return rule.replacement;
    }
  }

  return trimmed;
}
