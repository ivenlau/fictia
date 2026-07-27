import { useState, useCallback, useRef, useMemo } from "react";
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
  Bug,
  Trash2,
  Layers,
  Wrench,
} from "lucide-react";
import { AGENT_TYPE_LABELS } from "@fictia/shared";
import type { AgentType, AgentOutput, Chapter } from "@fictia/shared";
import { useAgentOutputs, useDeleteAgentOutput, useClearAgentOutputs } from "@/hooks/useAgent";
import { useChapters } from "@/hooks/useNovel";
import { useEditorStore } from "@/stores/editorStore";
import { useUIStore } from "@/stores/uiStore";
import { AgentRunDetailModal } from "./AgentRunDetailModal";

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

export function DebugPanel() {
  const explorerWidth = useUIStore((s) => s.explorerWidth);
  const setExplorerWidth = useUIStore((s) => s.setExplorerWidth);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const openFiles = useEditorStore((s) => s.openFiles);
  const activeFileId = useEditorStore((s) => s.activeFileId);
  const activeNovelId = openFiles.find((f) => f.id === activeFileId)?.novelId;

  const { data: outputs } = useAgentOutputs(activeNovelId);
  const { data: chapters } = useChapters(activeNovelId);
  const deleteOne = useDeleteAgentOutput(activeNovelId);
  const clearAll = useClearAgentOutputs(activeNovelId);

  const [detail, setDetail] = useState<{ outputId: string; agentLabel: string } | null>(null);

  const chapterMap = useMemo(() => {
    const map: Record<string, Chapter> = {};
    if (chapters) for (const ch of chapters) map[ch.id] = ch;
    return map;
  }, [chapters]);

  const sortedOutputs = useMemo(() => {
    if (!outputs) return [];
    return [...outputs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [outputs]);

  const handleDelete = useCallback(
    (output: AgentOutput) => {
      const label = AGENT_TYPE_LABELS[output.agentType as AgentType] ?? output.agentType;
      if (!window.confirm(`确定删除这条「${label}」运行记录吗？相关输出与调试 trace 将一并删除。`)) return;
      deleteOne.mutate(output.id);
    },
    [deleteOne],
  );

  const handleClearAll = useCallback(() => {
    if (sortedOutputs.length === 0) return;
    if (!window.confirm(`确定清空全部 ${sortedOutputs.length} 条运行记录吗？此操作不可撤销。`)) return;
    clearAll.mutate();
  }, [clearAll, sortedOutputs.length]);

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
        <Header onClearAll={undefined} />
        <div className="flex-1 flex items-center justify-center">
          <p className="font-caption text-xs text-fg-muted">请先打开一本小说</p>
        </div>
        <ResizeHandle onStart={handleResizeStart} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      <Header onClearAll={sortedOutputs.length > 0 ? handleClearAll : undefined} count={sortedOutputs.length} />

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {sortedOutputs.length === 0 ? (
          <div className="flex items-center justify-center h-20">
            <p className="font-caption text-xs text-fg-muted">暂无运行记录</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {sortedOutputs.map((output) => {
              const agentType = output.agentType as AgentType;
              const Icon = agentIcons[agentType] ?? Search;
              const cfg = statusConfig[output.status] ?? statusConfig.pending;

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
              const label = AGENT_TYPE_LABELS[agentType] ?? agentType;

              return (
                <div
                  key={output.id}
                  className="group flex w-full items-start gap-2.5 rounded px-2 py-2 text-left transition-colors hover:bg-surface-muted/50 cursor-pointer"
                  onClick={() => setDetail({ outputId: output.id, agentLabel: label })}
                >
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded mt-0.5 ${cfg.bg}`}>
                    {output.status === "running" ? (
                      <Loader2 size={14} className={`${cfg.color} animate-spin`} />
                    ) : (
                      <Icon size={14} className={cfg.color} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-caption text-xs text-fg-primary truncate">{label}</p>
                      <span className={`inline-block rounded px-1 py-0.5 font-caption text-[9px] ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>
                    {subtitle && (
                      <p className="font-caption text-[10px] text-fg-muted truncate mt-0.5">{subtitle}</p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="font-caption text-[10px] text-fg-muted/60">{formatTime(output.createdAt)}</span>
                      {duration && <span className="font-caption text-[10px] text-fg-muted/60">{duration}</span>}
                      {output.turnCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 font-caption text-[10px] text-fg-muted/60">
                          <Layers size={9} />
                          {output.turnCount}轮
                        </span>
                      )}
                      {output.toolCallCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 font-caption text-[10px] text-fg-muted/60">
                          <Wrench size={9} />
                          {output.toolCallCount}工具
                        </span>
                      )}
                      {output.modelUsed && (
                        <span className="font-caption text-[10px] text-fg-muted/60 truncate">{output.modelUsed}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(output);
                    }}
                    title="删除"
                    className="shrink-0 rounded p-1 text-fg-muted/0 group-hover:text-fg-muted hover:!text-error hover:bg-error/10 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ResizeHandle onStart={handleResizeStart} />

      {detail && (
        <AgentRunDetailModal
          outputId={detail.outputId}
          agentLabel={detail.agentLabel}
          onClose={() => setDetail(null)}
          onDelete={(id) => {
            deleteOne.mutate(id);
            setDetail(null);
          }}
        />
      )}
    </div>
  );
}

function Header({ onClearAll, count }: { onClearAll?: () => void; count?: number }) {
  return (
    <div className="px-3 pt-3 pb-1 flex items-center gap-1.5">
      <Bug size={13} className="text-fg-muted" />
      <p className="font-caption text-[11px] font-semibold uppercase tracking-wider text-fg-muted">调试</p>
      {!!count && count > 0 && (
        <span className="rounded bg-surface-muted px-1.5 py-0.5 font-caption text-[10px] text-fg-muted">{count}</span>
      )}
      <div className="flex-1" />
      {onClearAll && (
        <button
          onClick={onClearAll}
          title="清空全部"
          className="rounded p-1 text-fg-muted hover:text-error hover:bg-error/10 transition-colors"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

function ResizeHandle({ onStart }: { onStart: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onStart}
      className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent/30 transition-colors z-10"
    />
  );
}
