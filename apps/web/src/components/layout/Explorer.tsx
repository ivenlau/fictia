import { useState, useCallback, useEffect, useRef } from "react";
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  FileText,
  BookOpen,
  Library,
} from "lucide-react";
import { useNovelStore } from "../../stores/novelStore";
import { useEditorStore } from "../../stores/editorStore";
import { useUIStore } from "../../stores/uiStore";
import { novelsApi } from "../../api/novels";
import { useChapters } from "../../hooks/useNovel";
import { FileTree } from "../../features/explorer/FileTree";
import type { WorkspaceFile } from "@fictia/shared";

/** 资源管理器：只加载当前选中项目 */
export function Explorer() {
  const openFiles = useEditorStore((s) => s.openFiles);
  const activeFileId = useEditorStore((s) => s.activeFileId);
  const setActiveFile = useEditorStore((s) => s.setActiveFile);
  const explorerWidth = useUIStore((s) => s.explorerWidth);
  const setExplorerWidth = useUIStore((s) => s.setExplorerWidth);

  const currentNovelId = useNovelStore((s) => s.currentNovelId);
  const currentNovel = useNovelStore((s) => s.currentNovel);
  const novels = useNovelStore((s) => s.novels);
  const enterProject = useNovelStore((s) => s.enterProject);

  const novelTitle =
    currentNovel?.title ?? novels.find((n) => n.id === currentNovelId)?.title ?? "当前项目";

  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const { data: chapters = [] } = useChapters(currentNovelId ?? undefined);

  // 只加载当前项目的工作区文件
  useEffect(() => {
    if (!currentNovelId) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    novelsApi
      .getFiles(currentNovelId)
      .then((data) => {
        if (!cancelled) setFiles(data);
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [currentNovelId]);

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startWidth: explorerWidth };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = ev.clientX - dragRef.current.startX;
        setExplorerWidth(dragRef.current.startWidth + delta);
      };

      const handleMouseUp = () => {
        dragRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [explorerWidth, setExplorerWidth],
  );

  const handleOpenProject = useCallback(() => {
    if (!currentNovel) {
      const found = novels.find((n) => n.id === currentNovelId);
      if (found) enterProject(found);
      return;
    }
    enterProject(currentNovel);
  }, [currentNovel, currentNovelId, novels, enterProject]);

  return (
    <div className="flex flex-col h-full relative">
      <div className="border-b border-subtle px-3 pb-2 pt-3">
        <p className="font-display text-[12px] font-semibold tracking-wide text-fg-primary">
          资源管理
        </p>
        <p className="mt-0.5 font-caption text-[10px] uppercase tracking-[0.12em] text-fg-muted">
          EXPLORER
        </p>
      </div>

      {openFiles.length > 0 && (
        <div className="px-2 pt-1">
          <button
            onClick={() => toggle("__open_editors")}
            className="flex items-center gap-1 w-full text-left px-1 py-1"
          >
            {expanded.__open_editors !== false ? (
              <ChevronDown size={12} className="text-fg-muted" />
            ) : (
              <ChevronRight size={12} className="text-fg-muted" />
            )}
            <span className="font-caption text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
              Open Editors
            </span>
          </button>
          {expanded.__open_editors !== false && (
            <div className="ml-1 space-y-0.5">
              {openFiles.map((f) => {
                const isActive = f.id === activeFileId;
                const Icon =
                  f.type === "chapter" || f.type === "overview" ? BookOpen : FileText;
                return (
                  <button
                    key={f.id}
                    onClick={() => setActiveFile(f.id)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left transition-colors ${
                      isActive
                        ? "bg-surface-muted text-fg-primary"
                        : "text-fg-secondary hover:bg-surface-muted/50"
                    }`}
                  >
                    <Icon size={14} className={isActive ? "text-accent" : ""} />
                    <span className="font-caption text-xs truncate">{f.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 pt-2 pb-3">
        {!currentNovelId ? (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <Library size={22} className="mb-2 text-fg-muted/40" />
            <p className="font-caption text-[11px] text-fg-muted">未选择项目</p>
            <p className="mt-1 font-caption text-[10px] text-fg-muted/70">
              在「概览」页或顶栏切换器中进入一个小说项目
            </p>
          </div>
        ) : (
          <>
            <button
              onClick={handleOpenProject}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-surface-muted/50"
              title="打开项目主页"
            >
              <FolderOpen size={14} className="text-accent" />
              <span className="font-caption text-xs font-semibold text-fg-primary truncate">
                {novelTitle}
              </span>
            </button>
            <div className="ml-1 mt-0.5">
              <FileTree files={files} chapters={chapters} />
            </div>
          </>
        )}
      </div>

      <div
        onMouseDown={handleResizeStart}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent/30 transition-colors z-10"
      />
    </div>
  );
}
