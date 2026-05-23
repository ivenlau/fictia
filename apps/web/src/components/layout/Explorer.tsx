import { useState, useCallback, useRef, useEffect } from "react";
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
  FileText,
  BookOpen,
} from "lucide-react";
import { useNovelStore } from "../../stores/novelStore";
import { useEditorStore } from "../../stores/editorStore";
import { useUIStore } from "../../stores/uiStore";
import { novelsApi } from "../../api/novels";
import { useNovels } from "../../hooks/useNovel";
import { chaptersApi } from "../../api/chapters";
import { FileTree } from "../../features/explorer/FileTree";
import type { WorkspaceFile, Chapter } from "@fictia/shared";

interface NovelData {
  files: WorkspaceFile[];
  chapters: Chapter[];
}

export function Explorer() {
  const openFile = useEditorStore((s) => s.openFile);
  const openFiles = useEditorStore((s) => s.openFiles);
  const activeFileId = useEditorStore((s) => s.activeFileId);
  const setActiveFile = useEditorStore((s) => s.setActiveFile);
  const explorerWidth = useUIStore((s) => s.explorerWidth);
  const setExplorerWidth = useUIStore((s) => s.setExplorerWidth);

  const activeNovelId = openFiles.find((f) => f.id === activeFileId)?.novelId;

  const { data: novels = [] } = useNovels();
  const [novelData, setNovelData] = useState<Record<string, NovelData>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const toggle = useCallback(
    (key: string) => {
      setExpanded((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        if (next[key] && !novelData[key]) {
          Promise.all([
            novelsApi.getFiles(key),
            chaptersApi.list(key),
          ]).then(([files, chapters]) => {
            setNovelData((d) => ({ ...d, [key]: { files, chapters } }));
          }).catch(() => {});
        }
        return next;
      });
    },
    [novelData],
  );

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

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="px-3 pt-3 pb-1">
        <p className="font-caption text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
          EXPLORER
        </p>
      </div>

      {/* Open Editors */}
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
                  f.type === "chapter"
                    ? BookOpen
                    : f.type === "overview"
                      ? BookOpen
                      : FileText;
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
                    <span className="font-caption text-xs truncate">
                      {f.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Novel Tree */}
      <div className="flex-1 overflow-y-auto px-2 pt-2 pb-3">
        <button
          onClick={() => toggle("__novels")}
          className="flex items-center gap-1 w-full text-left px-1 py-1"
        >
          {expanded.__novels !== false ? (
            <ChevronDown size={12} className="text-fg-muted" />
          ) : (
            <ChevronRight size={12} className="text-fg-muted" />
          )}
          <span className="font-caption text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
            NOVELS
          </span>
        </button>

        {expanded.__novels !== false && (
          <div className="space-y-0.5">
            {novels.map((novel) => {
              const isNovelExpanded = !!expanded[novel.id];
              const isActive = novel.id === activeNovelId;
              const data = novelData[novel.id];

              return (
                <div key={novel.id}>
                  {/* Novel folder */}
                  <button
                    onClick={() => {
                      toggle(novel.id);
                      openFile({
                        id: `overview_${novel.id}`,
                        path: novel.title,
                        type: "overview",
                        label: novel.title,
                        novelId: novel.id,
                        novelTitle: novel.title,
                      });
                    }}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left ${
                      activeNovelId === novel.id ? "bg-accent-bg/50" : "hover:bg-surface-muted/50"
                    }`}
                  >
                    {isNovelExpanded ? (
                      <ChevronDown size={12} className="text-fg-muted" />
                    ) : (
                      <ChevronRight size={12} className="text-fg-muted" />
                    )}
                    {isNovelExpanded ? (
                      <FolderOpen size={14} className="text-accent" />
                    ) : (
                      <Folder size={14} className="text-accent" />
                    )}
                    <span className="font-caption text-xs font-semibold text-fg-primary truncate">
                      {novel.title}
                    </span>
                  </button>

                  {/* Unified file tree */}
                  {isNovelExpanded && data && (
                    <div className="ml-2">
                      <FileTree files={data.files} chapters={data.chapters} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent/30 transition-colors z-10"
      />
    </div>
  );
}
