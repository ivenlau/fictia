import { create } from "zustand";
import {
  CUSTOM_STORAGE_KEY,
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  applyTheme,
  getTheme,
  readStoredCustom,
  type CustomColors,
  type ThemeId,
} from "../styles/themes";

export type SettingsTab =
  | "providers"
  | "agents"
  | "assistant"
  | "knowledge"
  | "pipeline"
  | "about";

function readStoredTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw) return getTheme(raw).id;
  } catch {
    // ignore
  }
  return DEFAULT_THEME;
}

interface UIState {
  showSettings: boolean;
  settingsInitialTab: SettingsTab;
  showNewNovel: boolean;
  activePanel: "explorer" | "search" | "debug" | "agent" | "knowledge" | "material" | "tools";
  explorerVisible: boolean;
  explorerWidth: number;
  theme: ThemeId;
  customColors: CustomColors;
  themeMenuOpen: boolean;
  setShowSettings: (v: boolean) => void;
  openSettings: (tab?: SettingsTab) => void;
  setShowNewNovel: (v: boolean) => void;
  setActivePanel: (p: UIState["activePanel"]) => void;
  toggleExplorer: () => void;
  setExplorerWidth: (w: number) => void;
  setTheme: (id: ThemeId) => void;
  setCustomColors: (patch: Partial<CustomColors>) => void;
  setThemeMenuOpen: (v: boolean) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  showSettings: false,
  settingsInitialTab: "providers",
  showNewNovel: false,
  activePanel: "explorer",
  explorerVisible: true,
  explorerWidth: 260,
  theme: readStoredTheme(),
  customColors: readStoredCustom(),
  themeMenuOpen: false,
  setShowSettings: (v) => set({ showSettings: v }),
  openSettings: (tab) =>
    set({ showSettings: true, settingsInitialTab: tab ?? "providers" }),
  setShowNewNovel: (v) => set({ showNewNovel: v }),
  setActivePanel: (p) => {
    const state = get();
    if (state.activePanel === p) {
      set({ explorerVisible: !state.explorerVisible });
    } else {
      set({ activePanel: p, explorerVisible: true });
    }
  },
  toggleExplorer: () => set((s) => ({ explorerVisible: !s.explorerVisible })),
  setExplorerWidth: (w) => set({ explorerWidth: Math.max(160, Math.min(500, w)) }),
  setTheme: (id) => {
    const custom = get().customColors;
    applyTheme(id, custom);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      // ignore
    }
    set({ theme: id });
  },
  setCustomColors: (patch) => {
    const next = { ...get().customColors, ...patch };
    try {
      localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    set({ customColors: next });
    // 若当前是自定义主题，实时预览
    if (get().theme === "custom") {
      applyTheme("custom", next);
    }
  },
  setThemeMenuOpen: (v) => set({ themeMenuOpen: v }),
}));
