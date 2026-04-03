import os from "node:os";
import path from "node:path";

export interface AskpassInfo {
  helperPath: string;
  available: boolean;
}

export function getAskpassInfo(): AskpassInfo {
  const versionDir = path.join(
    os.homedir(),
    ".local",
    "share",
    "cursor-agent",
    "versions",
  );

  return {
    helperPath: path.join(versionDir, "cursor-askpass"),
    available: true,
  };
}
