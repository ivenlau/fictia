import { create } from "zustand";

interface OpenFile {
  id: string;
  path: string;
  type: "workspace" | "chapter" | "file" | "overview";
  label: string;
  novelId?: string;
  novelTitle?: string;
}

interface EditorState {
  openFiles: OpenFile[];
  activeFileId: string | null;
  openFile: (file: OpenFile) => void;
  closeFile: (id: string) => void;
  closeAllFiles: () => void;
  setActiveFile: (id: string | null) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  openFiles: [],
  activeFileId: null,
  openFile: (file) => {
    const existing = get().openFiles.find((f) => f.id === file.id);
    if (!existing) {
      set((s) => ({ openFiles: [...s.openFiles, file], activeFileId: file.id }));
    } else {
      set({ activeFileId: file.id });
    }
  },
  closeFile: (id) =>
    set((s) => {
      const filtered = s.openFiles.filter((f) => f.id !== id);
      return {
        openFiles: filtered,
        activeFileId: s.activeFileId === id ? (filtered[0]?.id ?? null) : s.activeFileId,
      };
    }),
  closeAllFiles: () => set({ openFiles: [], activeFileId: null }),
  setActiveFile: (id) => set({ activeFileId: id }),
}));
