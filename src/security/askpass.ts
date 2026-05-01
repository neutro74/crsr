import { existsSync } from "node:fs";
import path from "node:path";
import { getDataRoot } from "../config/config.js";

export interface AskpassInfo {
  helperPath: string;
  available: boolean;
}

export function getAskpassInfo(): AskpassInfo {
  const versionDir = path.join(getDataRoot(), "cursor-agent", "versions");
  const helperPath = path.join(versionDir, "cursor-askpass");

  return {
    helperPath,
    available: existsSync(helperPath),
  };
}
