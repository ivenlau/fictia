import { create } from "zustand";
import type { Novel, Chapter, WorkspaceFile } from "@fictia/shared";

interface NovelState {
  novels: Novel[];
  currentNovel: Novel | null;
  chapters: Chapter[];
  workspaceFiles: WorkspaceFile[];
  setNovels: (novels: Novel[]) => void;
  setCurrentNovel: (novel: Novel | null) => void;
  setChapters: (chapters: Chapter[]) => void;
  setWorkspaceFiles: (files: WorkspaceFile[]) => void;
}

export const useNovelStore = create<NovelState>((set) => ({
  novels: [],
  currentNovel: null,
  chapters: [],
  workspaceFiles: [],
  setNovels: (novels) => set({ novels }),
  setCurrentNovel: (novel) => set({ currentNovel: novel }),
  setChapters: (chapters) => set({ chapters }),
  setWorkspaceFiles: (files) => set({ workspaceFiles: files }),
}));
