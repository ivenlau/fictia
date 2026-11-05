import { create } from "zustand";
import type { Novel, Chapter, WorkspaceFile } from "@fictia/shared";
import { useEditorStore } from "./editorStore";

const CURRENT_NOVEL_KEY = "fictia.currentNovelId";

function readStoredNovelId(): string | null {
  try {
    return localStorage.getItem(CURRENT_NOVEL_KEY);
  } catch {
    return null;
  }
}

function persistNovelId(id: string | null) {
  try {
    if (id) localStorage.setItem(CURRENT_NOVEL_KEY, id);
    else localStorage.removeItem(CURRENT_NOVEL_KEY);
  } catch {
    // ignore
  }
}

interface NovelState {
  novels: Novel[];
  /** 当前选中的小说项目 id；null = 概览画廊（未进入项目） */
  currentNovelId: string | null;
  currentNovel: Novel | null;
  chapters: Chapter[];
  workspaceFiles: WorkspaceFile[];
  setNovels: (novels: Novel[]) => void;
  /** 选中项目并持久化；传 null 回到概览（保留已打开标签） */
  selectNovel: (novel: Novel | null) => void;
  /** 进入项目主页：选中 + 打开 overview 标签 + 关闭其他项目文件 */
  enterProject: (novel: Novel) => void;
  /** 回到项目概览画廊（不强制清空 currentNovelId，资源侧仍可用最近项目） */
  showGallery: () => void;
  setCurrentNovel: (novel: Novel | null) => void;
  setChapters: (chapters: Chapter[]) => void;
  setWorkspaceFiles: (files: WorkspaceFile[]) => void;
  /** 删除项目后清理选中态与相关标签 */
  clearProjectIfSelected: (novelId: string) => void;
}

export function overviewTabId(novelId: string) {
  return `overview_${novelId}`;
}

export function projectOverviewFile(novel: Novel) {
  return {
    id: overviewTabId(novel.id),
    path: novel.title,
    type: "overview" as const,
    label: novel.title,
    novelId: novel.id,
    novelTitle: novel.title,
  };
}

/** 进入项目：选中 + 关闭其他项目标签 + 打开项目主页 */
export function enterProjectSafe(novel: Novel) {
  useNovelStore.getState().enterProject(novel);
}

export const useNovelStore = create<NovelState>((set, get) => ({
  novels: [],
  currentNovelId: readStoredNovelId(),
  currentNovel: null,
  chapters: [],
  workspaceFiles: [],
  setNovels: (novels) => {
    const id = get().currentNovelId;
    const current = novels.find((n) => n.id === id) ?? null;
    set({ novels, currentNovel: current });
  },
  setCurrentNovel: (novel) => {
    persistNovelId(novel?.id ?? null);
    set({ currentNovel: novel, currentNovelId: novel?.id ?? null });
  },
  selectNovel: (novel) => {
    persistNovelId(novel?.id ?? null);
    set({ currentNovel: novel, currentNovelId: novel?.id ?? null });
  },
  enterProject: (novel) => {
    persistNovelId(novel.id);
    const editor = useEditorStore.getState();
    // 切换项目时关闭其他项目的标签
    for (const f of [...editor.openFiles]) {
      if (f.novelId && f.novelId !== novel.id) {
        editor.closeFile(f.id);
      }
    }
    set({ currentNovel: novel, currentNovelId: novel.id });
    editor.openFile(projectOverviewFile(novel));
  },
  showGallery: () => {
    useEditorStore.getState().setActiveFile(null);
  },
  setChapters: (chapters) => set({ chapters }),
  setWorkspaceFiles: (files) => set({ workspaceFiles: files }),
  clearProjectIfSelected: (novelId) => {
    const editor = useEditorStore.getState();
    for (const f of [...editor.openFiles]) {
      if (f.novelId === novelId) editor.closeFile(f.id);
    }
    if (get().currentNovelId === novelId) {
      persistNovelId(null);
      set({ currentNovelId: null, currentNovel: null, chapters: [], workspaceFiles: [] });
    }
  },
}));
