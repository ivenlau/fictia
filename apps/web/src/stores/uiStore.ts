import { create } from "zustand";

export type SettingsTab =
  | "providers"
  | "agents"
  | "assistant"
  | "knowledge"
  | "about";

interface UIState {
  showSettings: boolean;
  settingsInitialTab: SettingsTab;
  showNewNovel: boolean;
  activePanel: "explorer" | "search" | "graph" | "agent" | "knowledge" | "material";
  explorerVisible: boolean;
  explorerWidth: number;
  setShowSettings: (v: boolean) => void;
  openSettings: (tab?: SettingsTab) => void;
  setShowNewNovel: (v: boolean) => void;
  setActivePanel: (p: UIState["activePanel"]) => void;
  toggleExplorer: () => void;
  setExplorerWidth: (w: number) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  showSettings: false,
  settingsInitialTab: "providers",
  showNewNovel: false,
  activePanel: "explorer",
  explorerVisible: true,
  explorerWidth: 260,
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
}));
