import { create } from "zustand";

interface UIState {
  showSettings: boolean;
  showNewNovel: boolean;
  activePanel: "explorer" | "search" | "graph" | "agent";
  explorerVisible: boolean;
  explorerWidth: number;
  setShowSettings: (v: boolean) => void;
  setShowNewNovel: (v: boolean) => void;
  setActivePanel: (p: UIState["activePanel"]) => void;
  toggleExplorer: () => void;
  setExplorerWidth: (w: number) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  showSettings: false,
  showNewNovel: false,
  activePanel: "explorer",
  explorerVisible: true,
  explorerWidth: 260,
  setShowSettings: (v) => set({ showSettings: v }),
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
