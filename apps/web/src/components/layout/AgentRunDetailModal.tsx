import { useEffect, useState } from "react";
import {
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Layers,
  Wrench,
  FileText,
  Send,
  Info,
  Terminal,
} from "lucide-react";
import type { AgentRunTrace, AgentRoundTrace, AgentToolCallTrace } from "@fictia/shared";
import { agentsApi } from "@/api/agents";

interface AgentRunDetailModalProps {
  outputId: string;
  agentLabel: string;
  onClose: () => void;
  /** 若提供，头部删除按钮调用之（由列表注入，负责删除并刷新）。 */
  onDelete?: (outputId: string) => void;
}

type Tab = "rounds" | "overview" | "output";

export function AgentRunDetailModal({ outputId, agentLabel, onClose, onDelete }: AgentRunDetailModalProps) {
  const [status, setStatus] = useState<string>("running");
  const [content, setContent] = useState<string>("");
  const [trace, setTrace] = useState<AgentRunTrace | null>(null);
  const [tab, setTab] = useState<Tab>("rounds");

  useEffect(() => {
    const url = agentsApi.getStreamUrl(outputId);
    const es = new EventSource(url);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "status") {
          if (data.status) setStatus(data.status);
          if (typeof data.content === "string") setContent(data.content);
          if (data.trace) setTrace(data.trace as AgentRunTrace);
        } else if (data.type === "done") {
          if (data.status) setStatus(data.status);
          es.close();
        }
      } catch {
        /* ignore malformed frame */
      }
    };
    es.onerror = () => es.close();

    return () => es.close();
  }, [outputId]);

  const isRunning = status === "running" || status === "pending";

  const statusBadge =
    status === "running" || status === "pending" ? (
      <span className="flex items-center gap-1 font-caption text-[11px] text-accent">
        <Loader2 size={12} className="animate-spin" />
        {status === "pending" ? "等待中" : "运行中"}
      </span>
    ) : status === "completed" ? (
      <span className="flex items-center gap-1 font-caption text-[11px] text-success">
        <CheckCircle2 size={12} />
        已完成
      </span>
    ) : status === "failed" ? (
      <span className="flex items-center gap-1 font-caption text-[11px] text-error">
        <XCircle size={12} />
        失败
      </span>
    ) : (
      <span className="flex items-center gap-1 font-caption text-[11px] text-fg-muted">
        <Clock size={12} />
        已取消
      </span>
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative flex flex-col h-[78vh] w-[960px] max-w-[95vw] rounded-xl border border-subtle bg-surface-primary shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-subtle px-5 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="font-heading text-base font-bold text-fg-primary truncate">{agentLabel}</h3>
            {statusBadge}
            {trace?.modelUsed && (
              <span className="font-caption text-[10px] text-fg-muted bg-surface-muted rounded px-1.5 py-0.5">
                {trace.modelUsed}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {onDelete && (
              <button
                onClick={() => {
                  if (window.confirm("确定删除这条运行记录吗？")) onDelete(outputId);
                }}
                title="删除"
                className="rounded-md p-1.5 text-fg-muted hover:text-error hover:bg-error/10 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-fg-muted hover:text-fg-primary hover:bg-surface-muted transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-subtle px-3 py-1.5">
          <TabButton active={tab === "rounds"} onClick={() => setTab("rounds")} icon={<Layers size={12} />}>
            轮次{trace ? ` (${trace.totalRounds})` : ""}
          </TabButton>
          <TabButton active={tab === "overview"} onClick={() => setTab("overview")} icon={<Info size={12} />}>
            概览
          </TabButton>
          <TabButton active={tab === "output"} onClick={() => setTab("output")} icon={<FileText size={12} />}>
            输出
          </TabButton>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5">
          {tab === "rounds" && <RoundsTab trace={trace} isRunning={isRunning} />}
          {tab === "overview" && <OverviewTab trace={trace} />}
          {tab === "output" && <OutputTab content={content} isRunning={isRunning} status={status} />}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-caption text-xs transition-colors ${
        active ? "bg-accent-bg text-accent" : "text-fg-muted hover:bg-surface-muted hover:text-fg-primary"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

// ==================== 轮次 ====================

function RoundsTab({ trace, isRunning }: { trace: AgentRunTrace | null; isRunning: boolean }) {
  if (!trace) return <EmptyHint isRunning={isRunning} />;
  if (trace.rounds.length === 0 && isRunning) {
    return (
      <div className="flex items-center gap-2 text-fg-muted">
        <Loader2 size={14} className="animate-spin" />
        <span className="font-caption text-sm">等待首轮输出…</span>
      </div>
    );
  }
  if (trace.rounds.length === 0) {
    return <p className="font-caption text-sm text-fg-muted">无轮次记录。</p>;
  }
  return (
    <div className="space-y-3">
      {trace.rounds.map((round) => (
        <RoundCard key={round.index} round={round} />
      ))}
      {trace.errorMessage && (
        <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 p-3">
          <AlertTriangle size={14} className="text-error mt-0.5 shrink-0" />
          <div>
            <p className="font-caption text-xs font-semibold text-error">运行出错</p>
            <pre className="font-body text-xs text-error/90 whitespace-pre-wrap mt-1">{trace.errorMessage}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function RoundCard({ round }: { round: AgentRoundTrace }) {
  return (
    <div className="rounded-lg border border-subtle bg-surface-secondary/40 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-subtle bg-surface-muted/40">
        <span className="font-caption text-[11px] font-semibold text-fg-secondary">第 {round.index + 1} 轮</span>
        <span className="inline-flex items-center gap-0.5 font-caption text-[10px] text-fg-muted">
          <Wrench size={10} />
          {round.toolCalls.length} 工具
        </span>
      </div>
      <div className="p-3 space-y-3">
        {round.assistantText && (
          <pre className="font-body text-[13px] text-fg-secondary whitespace-pre-wrap leading-relaxed">
            {round.assistantText}
          </pre>
        )}
        {round.toolCalls.map((tc, i) => (
          <ToolCallView key={i} tc={tc} />
        ))}
      </div>
    </div>
  );
}

function ToolCallView({ tc }: { tc: AgentToolCallTrace }) {
  const [open, setOpen] = useState(false);
  const inputStr = formatInput(tc.input);
  return (
    <div className={`rounded-md border ${tc.isError ? "border-error/40 bg-error/5" : "border-subtle bg-surface-primary"}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {open ? <ChevronDown size={12} className="text-fg-muted shrink-0" /> : <ChevronRight size={12} className="text-fg-muted shrink-0" />}
        <code className="font-mono text-xs text-fg-primary truncate">{tc.name}</code>
        {tc.isError ? (
          <span className="inline-block rounded bg-error/15 px-1 py-0.5 font-caption text-[9px] text-error">错误</span>
        ) : (
          <span className="inline-block rounded bg-success/15 px-1 py-0.5 font-caption text-[9px] text-success">成功</span>
        )}
        {tc.durationMs != null && (
          <span className="font-caption text-[10px] text-fg-muted ml-auto shrink-0">{formatMs(tc.durationMs)}</span>
        )}
      </button>
      {open && (
        <div className="border-t border-subtle px-3 py-2 space-y-2">
          <div>
            <p className="font-caption text-[10px] font-semibold uppercase tracking-wide text-fg-muted mb-1">入参</p>
            <pre className="font-mono text-[11px] text-fg-secondary whitespace-pre-wrap break-all bg-surface-muted/50 rounded p-2 max-h-60 overflow-auto">
              {inputStr}
            </pre>
          </div>
          {tc.result && (
            <div>
              <p className="font-caption text-[10px] font-semibold uppercase tracking-wide text-fg-muted mb-1">结果</p>
              <pre className="font-mono text-[11px] text-fg-secondary whitespace-pre-wrap break-all bg-surface-muted/50 rounded p-2 max-h-60 overflow-auto">
                {tc.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== 概览 ====================

function OverviewTab({ trace }: { trace: AgentRunTrace | null }) {
  if (!trace) return <EmptyHint isRunning={false} />;
  const duration = trace.completedAt
    ? formatDurationStr(trace.startedAt, trace.completedAt)
    : formatDurationStr(trace.startedAt, new Date().toISOString());
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="模型" value={trace.modelUsed || "—"} />
        <Stat label="轮次" value={`${trace.totalRounds}`} />
        <Stat label="工具调用" value={`${trace.rounds.reduce((n, r) => n + r.toolCalls.length, 0)}`} />
        <Stat label="耗时" value={duration} />
      </div>
      {trace.filesWritten.length > 0 && (
        <div>
          <p className="font-caption text-[10px] font-semibold uppercase tracking-wide text-fg-muted mb-1">写入文件</p>
          <div className="flex flex-wrap gap-1">
            {trace.filesWritten.map((f, i) => (
              <code key={i} className="font-mono text-[11px] text-fg-secondary bg-surface-muted rounded px-1.5 py-0.5">
                {f}
              </code>
            ))}
          </div>
        </div>
      )}
      <Collapsible icon={<Terminal size={12} />} title="系统提示词" text={trace.systemPrompt} />
      <Collapsible icon={<Send size={12} />} title="用户输入" text={trace.userPrompt} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-subtle bg-surface-secondary/40 px-3 py-2">
      <p className="font-caption text-[10px] uppercase tracking-wide text-fg-muted">{label}</p>
      <p className="font-body text-sm text-fg-primary truncate" title={value}>{value}</p>
    </div>
  );
}

function Collapsible({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <div className="rounded-lg border border-subtle overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-surface-muted/40">
        {open ? <ChevronDown size={12} className="text-fg-muted" /> : <ChevronRight size={12} className="text-fg-muted" />}
        {icon}
        <span className="font-caption text-xs font-semibold text-fg-secondary">{title}</span>
        <span className="font-caption text-[10px] text-fg-muted ml-auto">{text.length} 字符</span>
      </button>
      {open && (
        <pre className="font-body text-[12px] text-fg-secondary whitespace-pre-wrap leading-relaxed border-t border-subtle px-3 py-2 max-h-96 overflow-auto">
          {text}
        </pre>
      )}
    </div>
  );
}

// ==================== 输出 ====================

function OutputTab({ content, isRunning, status }: { content: string; isRunning: boolean; status: string }) {
  if (!content) {
    if (isRunning) {
      return (
        <div className="flex items-center gap-2 text-fg-muted">
          <Loader2 size={14} className="animate-spin" />
          <span className="font-caption text-sm">运行中，输出将在完成后写入…</span>
        </div>
      );
    }
    if (status === "failed") {
      return <p className="font-caption text-sm text-error">运行失败，无输出。</p>;
    }
    return <p className="font-caption text-sm text-fg-muted">无输出内容。</p>;
  }
  return (
    <pre className="font-body text-sm text-fg-secondary whitespace-pre-wrap leading-relaxed">{content}</pre>
  );
}

// ==================== helpers ====================

function EmptyHint({ isRunning }: { isRunning: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 text-fg-muted">
      {isRunning ? <Loader2 size={16} className="animate-spin" /> : <AlertTriangle size={16} />}
      <p className="font-caption text-sm">{isRunning ? "正在加载调试信息…" : "该记录无调试 trace（可能为旧版本生成的记录）。"}</p>
    </div>
  );
}

function formatInput(input: unknown): string {
  if (input == null) return "";
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDurationStr(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${s % 60}s`;
}
