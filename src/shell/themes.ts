export interface Theme {
  name: string;
  id: string;
  bg: string;
  fg: string;
  border: string;
  borderActive: string;
  label: string;
  dim: string;
  muted: string;
  accent: string;
  code: string;
  codeDim: string;
  codeFence: string;
  headerColor: string;
  error: string;
  warn: string;
  chipAi: string;
  chipYou: string;
  chipErr: string;
  chipOut: string;
  chipSys: string;
  tabBg: string;
  tabFg: string;
  tabActiveBg: string;
  tabActiveFg: string;
  tabBusyFg: string;
  selectionBg: string;
  selectionFg: string;
}

export const THEMES: Theme[] = [
  {
    name: "Dark",
    id: "dark",
    bg: "#000000",
    fg: "#e8e8e8",
    border: "#333333",
    borderActive: "#606060",
    label: "#555555",
    dim: "#404040",
    muted: "#909090",
    accent: "#7ec8e3",
    code: "#7ec8e3",
    codeDim: "#999999",
    codeFence: "#555555",
    headerColor: "#e8e8e8",
    error: "#cc5555",
    warn: "#ccaa55",
    chipAi: "#e8e8e8",
    chipYou: "#ffffff",
    chipErr: "#cc5555",
    chipOut: "#999999",
    chipSys: "#666666",
    tabBg: "#111111",
    tabFg: "#666666",
    tabActiveBg: "#000000",
    tabActiveFg: "#e8e8e8",
    tabBusyFg: "#7ec8e3",
    selectionBg: "#1a3a5c",
    selectionFg: "#ffffff",
  },
  {
    name: "Dracula",
    id: "dracula",
    bg: "#282a36",
    fg: "#f8f8f2",
    border: "#44475a",
    borderActive: "#6272a4",
    label: "#6272a4",
    dim: "#44475a",
    muted: "#6272a4",
    accent: "#bd93f9",
    code: "#50fa7b",
    codeDim: "#f8f8f2",
    codeFence: "#6272a4",
    headerColor: "#ff79c6",
    error: "#ff5555",
    warn: "#ffb86c",
    chipAi: "#f8f8f2",
    chipYou: "#ffffff",
    chipErr: "#ff5555",
    chipOut: "#6272a4",
    chipSys: "#44475a",
    tabBg: "#21222c",
    tabFg: "#6272a4",
    tabActiveBg: "#282a36",
    tabActiveFg: "#f8f8f2",
    tabBusyFg: "#bd93f9",
    selectionBg: "#44475a",
    selectionFg: "#f8f8f2",
  },
  {
    name: "Nord",
    id: "nord",
    bg: "#2e3440",
    fg: "#d8dee9",
    border: "#3b4252",
    borderActive: "#4c566a",
    label: "#4c566a",
    dim: "#3b4252",
    muted: "#4c566a",
    accent: "#88c0d0",
    code: "#a3be8c",
    codeDim: "#d8dee9",
    codeFence: "#4c566a",
    headerColor: "#81a1c1",
    error: "#bf616a",
    warn: "#ebcb8b",
    chipAi: "#eceff4",
    chipYou: "#ffffff",
    chipErr: "#bf616a",
    chipOut: "#4c566a",
    chipSys: "#3b4252",
    tabBg: "#242933",
    tabFg: "#4c566a",
    tabActiveBg: "#2e3440",
    tabActiveFg: "#eceff4",
    tabBusyFg: "#88c0d0",
    selectionBg: "#4c566a",
    selectionFg: "#eceff4",
  },
  {
    name: "Gruvbox",
    id: "gruvbox",
    bg: "#282828",
    fg: "#ebdbb2",
    border: "#504945",
    borderActive: "#665c54",
    label: "#928374",
    dim: "#3c3836",
    muted: "#928374",
    accent: "#fabd2f",
    code: "#b8bb26",
    codeDim: "#ebdbb2",
    codeFence: "#928374",
    headerColor: "#fe8019",
    error: "#cc241d",
    warn: "#d79921",
    chipAi: "#ebdbb2",
    chipYou: "#fbf1c7",
    chipErr: "#cc241d",
    chipOut: "#928374",
    chipSys: "#665c54",
    tabBg: "#1d2021",
    tabFg: "#665c54",
    tabActiveBg: "#282828",
    tabActiveFg: "#fbf1c7",
    tabBusyFg: "#fabd2f",
    selectionBg: "#3c3836",
    selectionFg: "#fbf1c7",
  },
  {
    name: "Catppuccin",
    id: "catppuccin",
    bg: "#1e1e2e",
    fg: "#cdd6f4",
    border: "#313244",
    borderActive: "#45475a",
    label: "#6c7086",
    dim: "#313244",
    muted: "#6c7086",
    accent: "#cba6f7",
    code: "#a6e3a1",
    codeDim: "#cdd6f4",
    codeFence: "#6c7086",
    headerColor: "#89b4fa",
    error: "#f38ba8",
    warn: "#fab387",
    chipAi: "#cdd6f4",
    chipYou: "#ffffff",
    chipErr: "#f38ba8",
    chipOut: "#6c7086",
    chipSys: "#45475a",
    tabBg: "#181825",
    tabFg: "#6c7086",
    tabActiveBg: "#1e1e2e",
    tabActiveFg: "#cdd6f4",
    tabBusyFg: "#cba6f7",
    selectionBg: "#45475a",
    selectionFg: "#cdd6f4",
  },
];

export const THEME_IDS = THEMES.map((t) => t.id);
export const DEFAULT_THEME_ID = "dark";

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}

export function nextThemeId(currentId: string): string {
  const index = THEME_IDS.indexOf(currentId);
  return THEME_IDS[(index + 1) % THEME_IDS.length] ?? DEFAULT_THEME_ID;
}

export function prevThemeId(currentId: string): string {
  const index = THEME_IDS.indexOf(currentId);
  const prev = index <= 0 ? THEME_IDS.length - 1 : index - 1;
  return THEME_IDS[prev] ?? DEFAULT_THEME_ID;
}
