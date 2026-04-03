export interface CommandDefinition {
  name: string;
  description: string;
  category: "shell" | "agent" | "mcp" | "session";
  usage: string;
}

export const shellCommands: CommandDefinition[] = [
  { name: "help", description: "Show all commands grouped by category.", category: "shell", usage: "/help" },
  { name: "clear", description: "Clear the conversation pane.", category: "shell", usage: "/clear" },
  { name: "history", description: "Show command history.", category: "shell", usage: "/history" },
  { name: "plan", description: "Shortcut for /mode plan.", category: "shell", usage: "/plan" },
  { name: "ask", description: "Shortcut for /mode ask.", category: "shell", usage: "/ask" },
  { name: "workspace", description: "Show or set the active workspace.", category: "shell", usage: "/workspace [path]" },
  { name: "cd", description: "Alias for /workspace — change working directory.", category: "shell", usage: "/cd [path]" },
  { name: "recent", description: "List recent workspaces; /recent <n> to switch.", category: "shell", usage: "/recent [n]" },
  { name: "model", description: "Show or set the default model for prompts.", category: "shell", usage: "/model [name|reset]" },
  { name: "mode", description: "Set prompt mode: normal, plan, or ask.", category: "shell", usage: "/mode [normal|plan|ask]" },
  { name: "force", description: "Toggle force/yolo mode (skip tool confirmations).", category: "shell", usage: "/force" },
  { name: "auto-run", description: "Alias for force mode. Use on, off, or status.", category: "shell", usage: "/auto-run [on|off|status]" },
  { name: "sandbox", description: "Set sandbox mode: enabled, disabled, or off (clear).", category: "shell", usage: "/sandbox [enabled|disabled|off]" },
  { name: "approve-mcps", description: "Toggle auto-approve all MCP servers.", category: "shell", usage: "/approve-mcps" },
  { name: "continue", description: "Toggle --continue: append to previous session on every prompt.", category: "shell", usage: "/continue" },
  { name: "resume", description: "Set a chat ID to resume with every prompt; /resume clear to stop.", category: "shell", usage: "/resume [chatId|clear]" },
  { name: "api-key", description: "Set or clear the API key for this session (not persisted).", category: "shell", usage: "/api-key [key|clear]" },
  { name: "header", description: "Manage custom request headers.", category: "shell", usage: "/header [add <h>|remove <n>|list|clear]" },
  { name: "new-chat", description: "Clear transcript state and start fresh prompts.", category: "shell", usage: "/new-chat" },
  { name: "config", description: "Show current session configuration.", category: "shell", usage: "/config" },
  { name: "raw", description: "Forward arguments directly to cursor-agent.", category: "shell", usage: "/raw <args...>" },
  { name: "exit", description: "Quit crsr.", category: "shell", usage: "/exit" },
  { name: "quit", description: "Alias for /exit.", category: "shell", usage: "/quit" },
];

export const agentCommands: CommandDefinition[] = [
  { name: "login", description: "Authenticate with Cursor.", category: "agent", usage: "/login" },
  { name: "logout", description: "Sign out and clear stored authentication.", category: "agent", usage: "/logout" },
  { name: "status", description: "View authentication status.", category: "agent", usage: "/status" },
  { name: "whoami", description: "Alias for /status.", category: "agent", usage: "/whoami" },
  { name: "about", description: "Display version, system, and account information.", category: "agent", usage: "/about" },
  { name: "models", description: "List available models for this account.", category: "agent", usage: "/models" },
  { name: "update", description: "Update Cursor Agent to the latest version.", category: "agent", usage: "/update" },
  { name: "acp", description: "Start the hidden ACP server mode.", category: "agent", usage: "/acp" },
  { name: "generate-rule", description: "Generate a new Cursor rule interactively.", category: "agent", usage: "/generate-rule" },
  { name: "rule", description: "Alias for /generate-rule.", category: "agent", usage: "/rule" },
  { name: "rules", description: "Alias for /generate-rule.", category: "agent", usage: "/rules" },
  { name: "install-shell-integration", description: "Install shell integration to ~/.zshrc.", category: "agent", usage: "/install-shell-integration" },
  { name: "uninstall-shell-integration", description: "Remove shell integration from ~/.zshrc.", category: "agent", usage: "/uninstall-shell-integration" },
  { name: "setup-terminal", description: "Alias for /install-shell-integration.", category: "agent", usage: "/setup-terminal" },
];

export const sessionCommands: CommandDefinition[] = [
  { name: "ls", description: "List resumable chat sessions.", category: "session", usage: "/ls" },
  { name: "create-chat", description: "Create a new empty chat and return its ID.", category: "session", usage: "/create-chat" },
  { name: "cloud", description: "Launch cursor-agent in cloud/composer mode.", category: "session", usage: "/cloud" },
  { name: "worktree", description: "Start agent in an isolated git worktree.", category: "session", usage: "/worktree [name] [--base <branch>] [--skip-setup]" },
];

export const mcpCommands: CommandDefinition[] = [
  { name: "mcp list", description: "List configured MCP servers and their status.", category: "mcp", usage: "/mcp list" },
  { name: "mcp login", description: "Authenticate with a configured MCP server.", category: "mcp", usage: "/mcp login <id>" },
  { name: "mcp list-tools", description: "List tools exposed by an MCP server.", category: "mcp", usage: "/mcp list-tools <id>" },
  { name: "mcp enable", description: "Approve a configured MCP server.", category: "mcp", usage: "/mcp enable <id>" },
  { name: "mcp disable", description: "Disable a configured MCP server.", category: "mcp", usage: "/mcp disable <id>" },
];

export const allCommands = [
  ...shellCommands,
  ...agentCommands,
  ...sessionCommands,
  ...mcpCommands,
];

export function renderGroupedHelp(): string {
  const groups: [string, CommandDefinition[]][] = [
    ["SHELL", shellCommands],
    ["AGENT", agentCommands],
    ["SESSION", sessionCommands],
    ["MCP", mcpCommands],
  ];

  const sections: string[] = [];
  for (const [label, commands] of groups) {
    const lines = commands.map(
      (command) => `  ${command.usage.padEnd(42)} ${command.description}`,
    );
    sections.push(`${label}\n${lines.join("\n")}`);
  }

  sections.push("PROMPTS\n  Type plain text to send a prompt.  Use /model and /mode to configure.");
  sections.push("SHELL MODE\n  Prefix input with ! to run a local shell command in the active workspace.");

  return sections.join("\n\n");
}
