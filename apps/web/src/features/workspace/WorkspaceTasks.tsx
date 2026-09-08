import { useCallback, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Palette,
  LayoutGrid,
  Users,
  BookOpen,
  Eye,
  PenLine,
  Loader2,
  Zap,
  Globe,
  ShieldCheck,
  Play,
  Pause,
  RotateCcw,
  FileText,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import {
  PIPELINE_PHASES,
  AGENT_FILE_MAP,
} from "@fictia/shared";
import type { AgentType, StageName } from "@fictia/shared";
import { useAgentOutputs } from "@/hooks/useAgent";
import { useEditorStore } from "@/stores/editorStore";
import {
  usePipelineStore,
  isStageEnabled,
  type StageState,
} from "@/stores/pipelineStore";
import { pipelinesApi } from "@/api/pipelines";
import { runWritingLoop, runDesignLoop } from "@/api/writing-loop";
import { novelsApi } from "@/api/novels";
import type { WorkspaceFile } from "@fictia/shared";

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
  "design-reviewer": ShieldCheck,
};

const statusLabels: Record<string, string> = {
  not_started: "等待执行",
  in_progress: "运行中",
  pending_confirm: "等待确认",
  confirmed: "已完成",
  needs_update: "需要更新",
  failed: "失败",
};

interface WorkspaceTasksProps {
  novelId: string;
  novelTitle: string;
}

export function WorkspaceTasks({ novelId, novelTitle }: WorkspaceTasksProps) {
  const qc = useQueryClient();
  const { data: outputs } = useAgentOutputs(novelId);
  const openFile = useEditorStore((s) => s.openFile);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const isRunning = usePipelineStore((s) => s.isRunning);
  const isPaused = usePipelineStore((s) => s.isPaused);
  const stages = usePipelineStore((s) => s.stages);
  const progress = usePipelineStore((s) => s.progress);
  const loadFromStatus = usePipelineStore((s) => s.loadFromStatus);
  const [errorModal, setErrorModal] = useState<{ stage: string; message: string } | null>(null);

  useEffect(() => {
    novelsApi.getFiles(novelId).then(setWorkspaceFiles).catch(() => {});
  }, [novelId]);

  const refreshStatus = useCallback(() => {
    pipelinesApi.getStatus(novelId).then((status) => {
      loadFromStatus(status);
    }).catch(() => {});
  }, [novelId, loadFromStatus]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(refreshStatus, 3000);
    return () => clearInterval(interval);
  }, [isRunning, refreshStatus]);

  const agentFileMap = (() => {
    const map: Record<string, WorkspaceFile> = {};
    for (const file of workspaceFiles) {
      map[file.path] = file;
    }
    return map;
  })();

  const handleForceConfirm = useCallback(
    async (stageName: StageName) => {
      try {
        await pipelinesApi.forceConfirmStage(novelId, stageName);
        refreshStatus();
      } catch (err: any) {
        setErrorModal({
          stage: stageName,
          message: err?.message ?? "核心产物不成立，无法强制确认",
        });
      }
    },
    [novelId, refreshStatus],
  );

  const handleOpenAgentFile = useCallback(
    (agentType: AgentType) => {
      const filePath = AGENT_FILE_MAP[agentType];
      const file = filePath ? agentFileMap[filePath] : undefined;
      if (!file) return;
      openFile({
        id: file.id,
        path: file.path,
        type: "workspace",
        label: `${novelTitle}/${filePath.split("/").pop()}`,
        novelId,
      });
    },
    [agentFileMap, openFile, novelId, novelTitle],
  );

  const handleRunStage = useCallback(
    async (stageName: StageName, options?: { isRedo?: boolean; userDirective?: string }) => {
      try {
        if (stageName === "chapters") {
          // 章节写作统一走 writing-loop（含 editor 审核 + review-fix + 实体更新）
          await runWritingLoop(novelId, { userDirective: options?.userDirective }, () => {});
        } else if (
          ["genre_analysis", "architecture", "style", "art_design", "narrative_weave", "world", "characters"].includes(stageName)
        ) {
          // 设计阶段走 design-loop（design-reviewer 审核 + review-fix）
          await runDesignLoop(novelId, { stageName }, () => {});
        } else {
          await pipelinesApi.runStage(novelId, stageName, {
            isRedo: options?.isRedo,
            userDirective: options?.userDirective,
          });
        }
        qc.invalidateQueries({ queryKey: ["agent-outputs", novelId] });
        refreshStatus();
      } catch (err: any) {
        console.error(`Stage ${stageName} failed:`, err);
        refreshStatus();
        setErrorModal({ stage: stageName, message: err?.message ?? "未知错误" });
      }
    },
    [novelId, qc, refreshStatus],
  );

  const handleStartPipeline = useCallback(async () => {
    try {
      await pipelinesApi.start(novelId);
      refreshStatus();
    } catch (err: any) {
      console.error("Start pipeline failed:", err);
    }
  }, [novelId, refreshStatus]);

  const handlePausePipeline = useCallback(async () => {
    try {
      await pipelinesApi.pause(novelId);
      refreshStatus();
    } catch (err: any) {
      console.error("Pause failed:", err);
    }
  }, [novelId, refreshStatus]);

  const handleResumePipeline = useCallback(async () => {
    try {
      await pipelinesApi.resume(novelId);
      refreshStatus();
    } catch (err: any) {
      console.error("Resume failed:", err);
    }
  }, [novelId, refreshStatus]);

  return (
    <div className="space-y-5">
      {/* Pipeline Control Bar */}
      <div className="flex items-center gap-3">
        {!isRunning && (
          <button
            onClick={handleStartPipeline}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-body text-xs font-medium text-accent-ink transition-colors hover:bg-accent-light"
          >
            <Zap size={13} />
            开始 Pipeline
          </button>
        )}
        {isRunning && !isPaused && (
          <button
            onClick={handlePausePipeline}
            className="flex items-center gap-1.5 rounded-md bg-warning/90 px-3 py-1.5 font-body text-xs font-medium text-accent-ink transition-colors hover:bg-warning"
          >
            <Pause size={13} />
            暂停
          </button>
        )}
        {isRunning && isPaused && (
          <button
            onClick={handleResumePipeline}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-body text-xs font-medium text-accent-ink transition-colors hover:bg-accent-light"
          >
            <Play size={13} />
            继续
          </button>
        )}
        {isPaused && (
          <span className="font-caption text-xs text-warning">已暂停 — 当前 agent 将完成执行</span>
        )}
        {isRunning && !isPaused && (
          <span className="flex items-center gap-1 font-caption text-xs text-accent">
            <Loader2 size={12} className="animate-spin" />
            执行中...
          </span>
        )}
        <div className="flex-1" />
        {progress && (
          <span className="font-caption text-xs text-fg-muted">
            {progress.confirmed}/{progress.total} ({progress.percentage}%)
          </span>
        )}
      </div>

      {/* Phase Groups */}
      {PIPELINE_PHASES.map((phase) => (
        <div key={phase.label}>
          <p className="font-caption text-[11px] font-semibold uppercase tracking-wider text-fg-muted mb-2.5">
            {phase.label}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {phase.stages.map((stageName) => {
              const stage = stages.find((s) => s.name === stageName);
              if (!stage) return null;
              return (
                <AgentCard
                  key={stageName}
                  stage={stage}
                  enabled={isStageEnabled(stage, stages)}
                  pipelineRunning={isRunning}
                  onRun={handleRunStage}
                  onOpenFile={handleOpenAgentFile}
                  onRefresh={refreshStatus}
                  onForceConfirm={handleForceConfirm}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* Error Modal */}
      {errorModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setErrorModal(null)}
        >
          <div
            className="w-[400px] max-w-[95vw] rounded-xl border border-subtle bg-surface-primary p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-heading text-base font-bold text-error mb-2">
              执行失败
            </h3>
            <p className="font-body text-sm text-fg-secondary mb-1">
              阶段「{errorModal.stage}」执行过程中出现错误：
            </p>
            <p className="font-body text-sm text-fg-primary bg-surface-muted rounded-lg p-3 break-all">
              {errorModal.message}
            </p>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setErrorModal(null)}
                className="rounded-md bg-surface-card border border-subtle px-4 py-2 font-body text-sm text-fg-secondary hover:bg-surface-muted transition-colors"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Individual Agent Card =====

interface AgentCardProps {
  stage: StageState;
  enabled: boolean;
  pipelineRunning: boolean;
  onRun: (stageName: StageName, options?: { isRedo?: boolean; userDirective?: string }) => void;
  onOpenFile: (agentType: AgentType) => void;
  onRefresh: () => void;
  /** 失败时按当前产物强制确认（跳过审核结论放行流程）。 */
  onForceConfirm: (stageName: StageName) => void;
}

function AgentCard({
  stage,
  enabled,
  pipelineRunning,
  onRun,
  onOpenFile,
  onRefresh,
  onForceConfirm,
}: AgentCardProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [isForceConfirming, setIsForceConfirming] = useState(false);
  const [showRerunModal, setShowRerunModal] = useState(false);

  const Icon = agentIcons[stage.agentType] ?? Search;
  const isDone = stage.status === "confirmed";
  const isRunning = stage.status === "in_progress";
  const isFailed = stage.status === "failed";
  const isNeedsUpdate = stage.status === "needs_update";
  const canRun = enabled && !pipelineRunning && !isRunning && !isExecuting;

  const handleRun = useCallback(async () => {
    setIsExecuting(true);
    try {
      await onRun(stage.name);
      onRefresh();
    } finally {
      setIsExecuting(false);
    }
  }, [stage.name, onRun, onRefresh]);

  const handleForceConfirm = useCallback(async () => {
    setIsForceConfirming(true);
    try {
      await onForceConfirm(stage.name);
    } finally {
      setIsForceConfirming(false);
    }
  }, [stage.name, onForceConfirm]);

  const handleRerunConfirm = useCallback(async (directive: string) => {
    setIsExecuting(true);
    setShowRerunModal(false);
    try {
      await onRun(stage.name, {
        isRedo: true,
        userDirective: directive || undefined,
      });
      onRefresh();
    } finally {
      setIsExecuting(false);
    }
  }, [stage.name, onRun, onRefresh]);

  return (
    <>
      <div
        className={`group rounded-lg border p-3 text-left transition-colors ${
          !enabled && !isRunning && !isDone
            ? "border-subtle/50 bg-surface-card/50 opacity-40"
            : isRunning || isExecuting
              ? "border-accent/40 bg-accent-bg/20"
              : isDone
                ? "border-success/30 bg-surface-card hover:border-success/50"
                : isFailed
                  ? "border-error/30 bg-error/5"
                  : isNeedsUpdate
                    ? "border-warning/30 bg-warning/5"
                    : "border-subtle bg-surface-card hover:border-accent/30"
        }`}
      >
        <div className="flex items-start gap-2.5">
          {/* Icon */}
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors ${
              isDone
                ? "bg-success/15 text-success"
                : isRunning || isExecuting
                  ? "bg-accent-bg text-accent"
                  : isFailed
                    ? "bg-error/15 text-error"
                    : isNeedsUpdate
                      ? "bg-warning/15 text-warning"
                      : enabled
                        ? "bg-surface-muted text-fg-muted"
                        : "bg-surface-muted/50 text-fg-muted/50"
            }`}
          >
            {isRunning || isExecuting ? (
              <Loader2 size={15} className="animate-spin" />
            ) : isFailed ? (
              <AlertCircle size={15} />
            ) : (
              <Icon size={15} />
            )}
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <p className="font-body text-sm text-fg-primary truncate">
              {stage.label}
            </p>
            <p
              className={`font-caption text-[11px] mt-0.5 ${
                isDone
                  ? "text-success"
                  : isRunning || isExecuting
                    ? "text-accent"
                    : isFailed
                      ? "text-error"
                      : isNeedsUpdate
                        ? "text-warning"
                        : "text-fg-muted"
              }`}
            >
              {isExecuting ? "执行中..." : statusLabels[stage.status] ?? stage.status}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {isDone && (
              <>
                <button
                  onClick={() => onOpenFile(stage.agentType)}
                  className="rounded p-1 text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg-secondary"
                  title="查看文档"
                >
                  <FileText size={13} />
                </button>
                <button
                  onClick={() => setShowRerunModal(true)}
                  className="rounded p-1 text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg-secondary"
                  title="重新执行"
                >
                  <RotateCcw size={13} />
                </button>
              </>
            )}
            {isFailed && (
              <>
                <button
                  onClick={handleRun}
                  disabled={isForceConfirming}
                  className="rounded p-1 text-error transition-colors hover:bg-error/10"
                  title="重试"
                >
                  <RotateCcw size={13} />
                </button>
                <button
                  onClick={handleForceConfirm}
                  disabled={isForceConfirming}
                  className="flex items-center gap-0.5 rounded px-1 text-warning transition-colors hover:bg-warning/10 disabled:opacity-50"
                  title="核心产物已在时，跳过审核结论强制确认，放行后续阶段"
                >
                  <CheckCircle size={13} />
                  <span className="font-caption text-[10px]">按产物继续</span>
                </button>
              </>
            )}
            {!isDone && !isRunning && !isFailed && !isNeedsUpdate && canRun && (
              <button
                onClick={handleRun}
                className="rounded p-1 text-fg-muted transition-colors hover:bg-accent-bg hover:text-accent"
                title="执行此阶段"
              >
                <Play size={14} />
              </button>
            )}
            {isNeedsUpdate && canRun && (
              <button
                onClick={handleRun}
                className="rounded p-1 text-warning transition-colors hover:bg-warning/10"
                title="重新执行"
              >
                <Play size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Rerun Modal */}
      {showRerunModal && (
        <RerunModal
          stageLabel={stage.label}
          onConfirm={handleRerunConfirm}
          onCancel={() => setShowRerunModal(false)}
        />
      )}
    </>
  );
}

// ===== Rerun Dialog =====

function RerunModal({
  stageLabel,
  onConfirm,
  onCancel,
}: {
  stageLabel: string;
  onConfirm: (directive: string) => void;
  onCancel: () => void;
}) {
  const [directive, setDirective] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-[440px] max-w-[95vw] rounded-xl border border-subtle bg-surface-primary p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-heading text-base font-bold text-fg-primary mb-1">
          重新执行「{stageLabel}」
        </h3>
        <p className="font-body text-sm text-fg-secondary mb-4">
          输入自定义指令可以引导 agent 按照你的要求重新执行。留空则直接重新执行。
        </p>
        <textarea
          value={directive}
          onChange={(e) => setDirective(e.target.value)}
          placeholder="例如：请更侧重分析悬疑元素的读者期待..."
          rows={3}
          className="w-full rounded-lg border border-subtle bg-surface-primary px-3 py-2 font-body text-sm text-fg-primary placeholder:text-fg-muted/50 focus:border-accent focus:outline-none resize-none"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="rounded-md border border-subtle bg-surface-card px-4 py-2 font-body text-sm text-fg-secondary hover:bg-surface-muted transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(directive)}
            className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 font-body text-sm font-medium text-accent-ink transition-colors hover:bg-accent-light"
          >
            <RotateCcw size={14} />
            重新执行
          </button>
        </div>
      </div>
    </div>
  );
}
