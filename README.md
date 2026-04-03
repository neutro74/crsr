# crsr

A terminal TUI and headless CLI wrapper around [`cursor-agent`](https://cursor.sh), the Cursor AI agent binary. Provides a persistent shell with slash commands, session memory, workspace switching, and a full-screen blessed interface.

## Requirements

- Node.js 18+
- `cursor-agent` binary on PATH, at `~/.local/bin/cursor-agent`, or configured via `CURSOR_AGENT_BINARY` / `binaryPath`

## Install

```bash
npm install
npm run release   # builds and copies dist/crsr → ~/.local/bin/crsr
```

Or run directly without installing:

```bash
npm run dev [options] [command or prompt]
```

## Usage

```
crsr [options] [initial command or prompt...]

Options:
  --workspace <path>  Set the active workspace for all delegated commands
  --once              Run one command headlessly and exit (non-interactive)
  -h, --help          Show help
  -v, --version       Show version
```

**Interactive mode** (default): launches the full-screen TUI. Type `/help` to list all commands. Plain text sends a prompt to the agent.

**Headless / scripting:**
```bash
crsr --once "refactor the auth module to use async/await"
crsr --once --workspace ~/myproject /status
crsr --workspace ~/myproject    # opens TUI with workspace pre-set
```

## Interactive Commands

### Shell
| Command | Description |
|---|---|
| `/help` | Show all commands grouped by category |
| `/clear` | Clear the conversation pane |
| `/history` | Show command history |
| `/workspace [path]` | Show or set the active workspace (`/cd` is an alias) |
| `/recent [n]` | List recent workspaces; `/recent <n>` to switch to one |
| `/model [name\|reset]` | Show or set the model for all prompts |
| `/mode [normal\|plan\|ask]` | Set agent mode: normal (default), plan (read-only planning), ask (Q&A) |
| `/force` | Toggle force/yolo mode — skips tool confirmations |
| `/config` | Show current session configuration |
| `/raw <args...>` | Forward raw arguments directly to `cursor-agent` |
| `/exit` | Quit crsr |

### Agent (delegated to `cursor-agent`)
| Command | Description |
|---|---|
| `/login` | Authenticate with Cursor |
| `/logout` | Sign out |
| `/status` / `/whoami` | View authentication status |
| `/about` | Show version, system, and account info |
| `/models` | List available models |
| `/update` | Update `cursor-agent` to the latest version |
| `/generate-rule` / `/rule` | Create a new Cursor rule interactively |
| `/install-shell-integration` | Install shell integration to `~/.zshrc` |
| `/uninstall-shell-integration` | Remove shell integration |

### Session
| Command | Description |
|---|---|
| `/ls` | List resumable chat sessions |
| `/resume` | Resume the latest chat session |
| `/create-chat` | Create a new empty chat and return its ID |
| `/cloud` | Launch agent in cloud mode |
| `/worktree [name]` | Start agent in an isolated git worktree |

### MCP
| Command | Description |
|---|---|
| `/mcp list` | List configured MCP servers |
| `/mcp login <id>` | Authenticate with an MCP server |
| `/mcp list-tools <id>` | List tools exposed by an MCP server |
| `/mcp enable <id>` | Approve an MCP server |
| `/mcp disable <id>` | Disable an MCP server |

## Configuration

Config file: `~/.config/crsr/config.json` (respects `$XDG_CONFIG_HOME`).

```json
{
  "binaryPath": "/custom/path/to/cursor-agent",
  "workspace": "/default/workspace/path",
  "defaultModel": "claude-sonnet-4-6",
  "defaultMode": "normal",
  "forceMode": false,
  "trustPrintMode": true,
  "commandPassthrough": true
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `binaryPath` | string | — | Explicit path to `cursor-agent` binary. Also reads `CURSOR_AGENT_BINARY` env var. |
| `workspace` | string | `$HOME` | Default workspace directory |
| `defaultModel` | string | agent default | Model to use for all prompts |
| `defaultMode` | `normal\|plan\|ask` | `"normal"` | Default agent mode |
| `forceMode` | boolean | `false` | Skip tool confirmations by default |
| `trustPrintMode` | boolean | `true` | Pass `--trust` in headless mode (avoids workspace trust prompts) |
| `commandPassthrough` | boolean | `true` | Allow unknown slash commands to be forwarded to `cursor-agent` |

Binary resolution order:
1. `config.binaryPath`
2. `CURSOR_AGENT_BINARY` environment variable
3. `~/.local/bin/cursor-agent`
4. `cursor-agent` on PATH

## Session State

Session is persisted to `~/.local/share/crsr/session.json` (respects `$XDG_DATA_HOME`).

Stored: command history (up to 200 entries), recent workspaces (up to 20), active workspace, current model, mode, and force flag. State is restored on next launch.

## Cursor Rules

`cursor-agent` automatically loads `.cursor/rules/*.mdc` files from the active workspace (and walks up the directory tree). Rules in `~/.cursor/rules/` apply globally across all projects.

Create rules interactively with `/generate-rule`, or place `.mdc` files manually:

```
---
description: Brief description (used for agent-requestable rules)
globs: **/*.ts          # optional: apply when matching files are open
alwaysApply: true       # optional: inject into every session
---

# Rule Title

Your guidance here.
```

## Build Scripts

| Script | Description |
|---|---|
| `npm run dev` | Run TypeScript source directly via `tsx` |
| `npm run build` | Compile to `dist/` with `tsc` |
| `npm run bundle` | Single-file CJS bundle at `dist/crsr` via esbuild (with shebang) |
| `npm run release` | Bundle + copy to `~/.local/bin/crsr` |
| `npm run check` | Type-check only, no emit |

## Project Structure

```
src/
├── main.tsx                 # CLI entry point
├── config/config.ts         # Config loading (XDG, Zod validation)
├── session/sessionStore.ts  # Session persistence
├── runtime/
│   ├── cursorAgent.ts       # cursor-agent subprocess + NDJSON streaming
│   └── commandCatalog.ts    # Slash command registry
├── shell/
│   ├── app.ts               # Blessed TUI application
│   ├── router.ts            # Input routing and command dispatch
│   └── generatedLogoFrames.ts
├── output/renderers.ts      # String formatters for all output views
└── security/askpass.ts      # cursor-askpass path helper
```
