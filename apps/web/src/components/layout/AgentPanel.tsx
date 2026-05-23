import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  Search,
  Palette,
  LayoutGrid,
  Users,
  BookOpen,
  Eye,
  PenLine,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Globe,
  ShieldCheck,
  ListChecks,
} from "lucide-react";
import {
  AGENT_TYPE_LABELS,
  AGENT_FILE_MAP,
} from "@fictia/shared";
import type { AgentType, AgentOutput, WorkspaceFile, Chapter } from "@fictia/shared";
import { useAgentOutputs } from "@/hooks/useAgent";
import { useChapters } from "@/hooks/useNovel";
import { useEditorStore } from "@/stores/editorStore";
import { useUIStore } from "@/stores/uiStore";
import { novelsApi } from "@/api/novels";
import { AgentStreamModal } from "./AgentStreamModal";

const agentIcons: Record<AgentType, React.ElementType> = {
  "genre-analyst": Search,
  "architect": LayoutGrid,
  "style-designer": Palette,
  "art-director": Eye,
  "narrative-weaver": BookOpen,
  "world-builder": Globe,
  "character-designer": Users,
  "story-designer": BookOpen,
  "chapter-writer": PenLine,
  "editor": PenLine,
  "consistency-checker": ShieldCheck,
};

const statusConfig: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  completed: { icon: CheckCircle2, color: "text-success", bg: "bg-success/15", label: "完成" },
  running: { icon: Loader2, color: "text-accent", bg: "bg-accent-bg", label: "运行中" },
  pending: { icon: Clock, color: "text-fg-muted", bg: "bg-surface-muted", label: "等待中" },
  failed: { icon: XCircle, color: "text-error", bg: "bg-error/15", label: "失败" },
  cancelled: { icon: XCircle, color: "text-fg-muted", bg: "bg-surface-muted", label: "已取消" },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const mon = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${mon}-${day} ${h}:${m}`;
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${s % 60}s`;
}

export function AgentPanel() {
  const openFile = useEditorStore((s) => s.openFile);
  const openFiles = useEditorStore((s) => s.openFiles);
  const activeFileId = useEditorStore((s) => s.activeFileId);
  const explorerWidth = useUIStore((s) => s.explorerWidth);
  const setExplorerWidth = useUIStore((s) => s.setExplorerWidth);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const activeNovelId = openFiles.find((f) => f.id === activeFileId)?.novelId;
  const { data: outputs } = useAgentOutputs(activeNovelId);
  const { data: chapters } = useChapters(activeNovelId);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);

  useEffect(() => {
    if (!activeNovelId) {
      setWorkspaceFiles([]);
      return;
    }
    novelsApi.getFiles(activeNovelId).then(setWorkspaceFiles).catch(() => {});
  }, [activeNovelId]);

  const filePathToId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of workspaceFiles) {
      map[f.path] = f.id;
    }
    return map;
  }, [workspaceFiles]);

  const chapterMap = useMemo(() => {
    const map: Record<string, Chapter> = {};
    if (chapters) {
      for (const ch of chapters) {
        map[ch.id] = ch;
      }
    }
    return map;
  }, [chapters]);

  const [streamModal, setStreamModal] = useState<{
    outputId: string;
    agentLabel: string;
  } | null>(null);

  // Sort outputs by creation time, newest first
  const sortedOutputs = useMemo(() => {
    if (!outputs) return [];
    return [...outputs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [outputs]);

  const handleOutputClick = useCallback(
    (output: AgentOutput) => {
      if (output.status === "running" || output.status === "pending") {
        setStreamModal({
          outputId: output.id,
          agentLabel: AGENT_TYPE_LABELS[output.agentType as AgentType] ?? output.agentType,
        });
        return;
      }

      if (output.status === "completed") {
        // For chapter-related outputs, try to open the agent output file
        const filePath = AGENT_FILE_MAP[output.agentType as AgentType];
        const fileId = filePath ? filePathToId[filePath] : undefined;

        if (output.agentType === "chapter-writer" && output.chapterId) {
          // For chapter writer, open the chapter itself
          const chapter = chapterMap[output.chapterId];
          if (chapter) {
            openFile({
              id: chapter.id,
              path: `chapters/${chapter.filename}`,
              type: "chapter",
              label: `第${chapter.number}章 ${chapter.title}`,
              novelId: activeNovelId!,
            });
          }
        } else if (fileId && filePath && activeNovelId) {
          // For pre-writing agents, open the workspace file
          openFile({
            id: fileId,
            path: filePath,
            type: "workspace",
            label: `${AGENT_TYPE_LABELS[output.agentType as AgentType]}/${filePath.split("/").pop()}`,
            novelId: activeNovelId,
          });
        }
      }
    },
    [activeNovelId, openFile, filePathToId, chapterMap],
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

  if (!activeNovelId) {
    return (
      <div className="flex flex-col h-full relative">
        <div className="px-3 pt-3 pb-1">
          <p className="font-caption text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
            任务记录
          </p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="font-caption text-xs text-fg-muted">请先打开一本小说</p>
        </div>
        <div
          onMouseDown={handleResizeStart}
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent/30 transition-colors z-10"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="px-3 pt-3 pb-1 flex items-center gap-1.5">
        <ListChecks size={13} className="text-fg-muted" />
        <p className="font-caption text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
          任务记录
        </p>
        {sortedOutputs.length > 0 && (
          <span className="rounded bg-surface-muted px-1.5 py-0.5 font-caption text-[10px] text-fg-muted">
            {sortedOutputs.length}
          </span>
        )}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {sortedOutputs.length === 0 ? (
          <div className="flex items-center justify-center h-20">
            <p className="font-caption text-xs text-fg-muted">暂无任务记录</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {sortedOutputs.map((output) => {
              const agentType = output.agentType as AgentType;
              const Icon = agentIcons[agentType] ?? Search;
              const cfg = statusConfig[output.status] ?? statusConfig.pending;
              const StatusIcon = cfg.icon;
              const isClickable = output.status === "completed" || output.status === "running" || output.status === "pending";

              // Build subtitle
              let subtitle = "";
              if (output.agentType === "chapter-writer" && output.chapterId) {
                const ch = chapterMap[output.chapterId];
                subtitle = ch ? `第${ch.number}章 ${ch.title}` : "章节写作";
              } else if (output.persona) {
                subtitle = output.persona;
              } else if (output.modelUsed) {
                subtitle = output.modelUsed;
              }

              const duration = formatDuration(output.createdAt, output.completedAt);

              return (
                <button
                  key={output.id}
                  onClick={() => handleOutputClick(output)}
                  disabled={!isClickable}
                  className={`flex w-full items-start gap-2.5 rounded px-2 py-2 text-left transition-colors ${
                    isClickable
                      ? "hover:bg-surface-muted/50 cursor-pointer"
                      : "cursor-default"
                  }`}
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded mt-0.5 ${cfg.bg}`}
                  >
                    {output.status === "running" ? (
                      <Loader2 size={14} className={`${cfg.color} animate-spin`} />
                    ) : (
                      <Icon size={14} className={cfg.color} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-caption text-xs text-fg-primary truncate">
                        {AGENT_TYPE_LABELS[agentType] ?? agentType}
                      </p>
                      <span className={`inline-block rounded px-1 py-0.5 font-caption text-[9px] ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>
                    {subtitle && (
                      <p className="font-caption text-[10px] text-fg-muted truncate mt-0.5">
                        {subtitle}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-caption text-[10px] text-fg-muted/60">
                        {formatTime(output.createdAt)}
                      </span>
                      {duration && (
                        <span className="font-caption text-[10px] text-fg-muted/60">
                          {duration}
                        </span>
                      )}
                      {output.modelUsed && (
                        <span className="font-caption text-[10px] text-fg-muted/60 truncate">
                          {output.modelUsed}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
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

      {/* Stream modal */}
      {streamModal && (
        <AgentStreamModal
          outputId={streamModal.outputId}
          agentLabel={streamModal.agentLabel}
          onClose={() => setStreamModal(null)}
        />
      )}
    </div>
  );
}
