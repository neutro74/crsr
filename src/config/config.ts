import { existsSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

const rawConfigSchema = z
  .object({
    binaryPath: z.string().trim().min(1).optional(),
    workspace: z.string().trim().min(1).optional(),
    defaultModel: z.string().trim().min(1).optional(),
    defaultMode: z.enum(["normal", "plan", "ask"]).optional(),
    forceMode: z.boolean().optional(),
    trustPrintMode: z.boolean().optional(),
    commandPassthrough: z.boolean().optional(),
    approveMcps: z.boolean().optional(),
    sandbox: z.enum(["enabled", "disabled"]).optional(),
    apiKey: z.string().trim().min(1).optional(),
    defaultHeaders: z.array(z.string()).optional(),
  })
  .partial();

export interface ShellPaths {
  configDir: string;
  dataDir: string;
  configFile: string;
  sessionFile: string;
}

export interface ShellConfig {
  binaryPath?: string;
  workspace?: string;
  defaultModel?: string;
  defaultMode: "normal" | "plan" | "ask";
  forceMode: boolean;
  trustPrintMode: boolean;
  commandPassthrough: boolean;
  approveMcps: boolean;
  sandbox: "enabled" | "disabled" | null;
  apiKey?: string;
  defaultHeaders: string[];
  paths: ShellPaths;
}

function getXdgPath(envValue: string | undefined, fallback: string): string {
  return envValue && envValue.trim().length > 0 ? envValue : fallback;
}

export function getShellPaths(): ShellPaths {
  const homeDirectory = os.homedir();
  const configRoot = getXdgPath(
    process.env.XDG_CONFIG_HOME,
    path.join(homeDirectory, ".config"),
  );
  const dataRoot = getXdgPath(
    process.env.XDG_DATA_HOME,
    path.join(homeDirectory, ".local", "share"),
  );

  const configDir = path.join(configRoot, "crsr");
  const dataDir = path.join(dataRoot, "crsr");

  return {
    configDir,
    dataDir,
    configFile: path.join(configDir, "config.json"),
    sessionFile: path.join(dataDir, "session.json"),
  };
}

export function loadShellConfig(): ShellConfig {
  const paths = getShellPaths();

  mkdirSync(paths.configDir, { recursive: true });
  mkdirSync(paths.dataDir, { recursive: true });

  let parsedConfig: z.infer<typeof rawConfigSchema> = {};
  if (existsSync(paths.configFile)) {
    try {
      const rawConfig = readFileSync(paths.configFile, "utf8");
      parsedConfig = rawConfigSchema.parse(JSON.parse(rawConfig));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown config parse error";
      throw new Error(`Unable to load config from ${paths.configFile}: ${message}`);
    }
  }

  return {
    binaryPath:
      parsedConfig.binaryPath ?? process.env.CURSOR_AGENT_BINARY ?? undefined,
    workspace: parsedConfig.workspace,
    defaultModel: parsedConfig.defaultModel,
    defaultMode: parsedConfig.defaultMode ?? "normal",
    forceMode: parsedConfig.forceMode ?? false,
    trustPrintMode: parsedConfig.trustPrintMode ?? true,
    commandPassthrough: parsedConfig.commandPassthrough ?? true,
    approveMcps: parsedConfig.approveMcps ?? false,
    sandbox: parsedConfig.sandbox ?? null,
    apiKey: parsedConfig.apiKey ?? process.env.CURSOR_API_KEY ?? undefined,
    defaultHeaders: parsedConfig.defaultHeaders ?? [],
    paths,
  };
}
