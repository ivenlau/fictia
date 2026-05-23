import { useCallback, useState, useEffect, useMemo } from "react";
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
  CheckCircle2,
  Zap,
  Globe,
  ShieldCheck,
} from "lucide-react";
import { AGENT_TYPE_LABELS, AGENT_FILE_MAP } from "@fictia/shared";
import type { AgentType, AgentOutput, WorkspaceFile } from "@fictia/shared";
import { useAgentOutputs } from "@/hooks/useAgent";
import { useEditorStore } from "@/stores/editorStore";
import { pipelinesApi } from "@/api/pipelines";
import { novelsApi } from "@/api/novels";

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

interface WorkspaceTasksProps {
  novelId: string;
  novelTitle: string;
}

export function WorkspaceTasks({ novelId, novelTitle }: WorkspaceTasksProps) {
  const qc = useQueryClient();
  const { data: outputs } = useAgentOutputs(novelId);
  const openFile = useEditorStore((s) => s.openFile);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [pipelineStatus, setPipelineStatus] = useState<any>(null);

  useEffect(() => {
    novelsApi.getFiles(novelId).then(setWorkspaceFiles).catch(() => {});
    pipelinesApi.getStatus(novelId).then(setPipelineStatus).catch(() => {});
  }, [novelId]);

  const agentFileMap = useMemo(() => {
    const map: Record<string, WorkspaceFile> = {};
    for (const file of workspaceFiles) {
      map[file.path] = file;
    }
    return map;
  }, [workspaceFiles]);

  const getOutputForAgent = useCallback(
    (type: AgentType): AgentOutput | undefined =>
      outputs?.find((o) => o.agentType === type),
    [outputs],
  );

  const isAgentCompleted = useCallback(
    (type: AgentType): boolean => {
      const output = getOutputForAgent(type);
      return output?.status === "completed";
    },
    [getOutputForAgent],
  );

  const isAgentRunning = useCallback(
    (type: AgentType): boolean => {
      const output = getOutputForAgent(type);
      return output?.status === "running";
    },
    [getOutputForAgent],
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

  const handleStartPipeline = useCallback(async () => {
    try {
      await pipelinesApi.start(novelId);
      qc.invalidateQueries({ queryKey: ["agent-outputs", novelId] });
      pipelinesApi.getStatus(novelId).then(setPipelineStatus).catch(() => {});
    } catch (err) {
      console.error("Pipeline failed:", err);
    }
  }, [novelId, qc]);

  // Get the first 5 agents (pre-writing phase)
  const preWritingAgents: AgentType[] = [
    "genre-analyst",
    "architect",
    "style-designer",
    "art-director",
    "narrative-weaver",
  ];

  const allPreWritingDone = preWritingAgents.every((t) => isAgentCompleted(t));
  const pipelineRunning = pipelineStatus?.stages?.some(
    (s: any) => s.status === "in_progress",
  );

  return (
    <div className="space-y-4">
      {/* Pipeline Action Bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleStartPipeline}
          disabled={pipelineRunning}
          className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 font-body text-[11px] font-medium text-white transition-colors hover:bg-accent-deep disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pipelineRunning ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Zap size={12} />
          )}
          {pipelineRunning ? "运行中..." : "开始 Pipeline"}
        </button>
        {pipelineStatus?.progress && (
          <span className="font-caption text-xs text-fg-muted">
            进度: {pipelineStatus.progress.confirmed}/{pipelineStatus.progress.total} ({pipelineStatus.progress.percentage}%)
          </span>
        )}
        {allPreWritingDone && (
          <span className="flex items-center gap-1 font-caption text-xs text-success">
            <CheckCircle2 size={13} />
            前期准备完成
          </span>
        )}
      </div>

      {/* Agent Document Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {preWritingAgents.map((agentType) => {
          const Icon = agentIcons[agentType] ?? Search;
          const output = getOutputForAgent(agentType);
          const isRunning = output?.status === "running";
          const isDone = output?.status === "completed";
          const canOpen = isDone && !isRunning;

          return (
            <button
              key={agentType}
              onClick={() => canOpen && handleOpenAgentFile(agentType)}
              disabled={!canOpen}
              title={isDone ? `查看${AGENT_TYPE_LABELS[agentType]}` : "文档尚未生成"}
              className={`group flex items-center gap-3 rounded-lg border border-subtle bg-surface-card p-3.5 text-left transition-colors ${
                canOpen
                  ? "hover:border-accent/40 hover:bg-accent-bg/30 cursor-pointer"
                  : "opacity-50 cursor-not-allowed"
              }`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors ${
                  isDone
                    ? "bg-success/15 text-success"
                    : isRunning
                      ? "bg-accent-bg text-accent"
                      : "bg-surface-muted text-fg-muted"
                }`}
              >
                {isRunning ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <Icon size={17} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-body text-sm text-fg-primary truncate">
                  {AGENT_TYPE_LABELS[agentType]}
                </p>
                {isDone && (
                  <p className="flex items-center gap-1 font-caption text-xs text-success mt-0.5">
                    <CheckCircle2 size={11} />
                    已完成 · 点击查看
                  </p>
                )}
                {isRunning && (
                  <p className="font-caption text-xs text-accent mt-0.5">
                    运行中...
                  </p>
                )}
                {!isDone && !isRunning && (
                  <p className="font-caption text-[11px] text-fg-muted mt-0.5">
                    等待生成
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
