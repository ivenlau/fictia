import { useEffect, useRef, useState } from "react";
import { Loader2, X, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import {
  runWritingLoop,
  type WritingLoopEvent,
} from "@/api/writing-loop";

interface WritingLoopDialogProps {
  novelId: string;
  chapterNumber?: number;
  onClose: () => void;
  onDone: (passed: boolean) => void;
}

interface LoopResult {
  passed: boolean;
  rounds: number;
  finalVerdict?: { grade?: string | null; severe?: number; normal?: number } | null;
  proseBlockingRemaining?: number;
  proseAdvisory?: number;
  entitiesUpdated?: number;
}

export function WritingLoopDialog({
  novelId,
  chapterNumber,
  onClose,
  onDone,
}: WritingLoopDialogProps) {
  const [running, setRunning] = useState(true);
  const [events, setEvents] = useState<WritingLoopEvent[]>([]);
  const [result, setResult] = useState<LoopResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let finished = false;
    runWritingLoop(novelId, { chapterNumber }, (e) => {
      setEvents((prev) => [...prev, e]);
      if (e.type === "result") setResult(e.result as LoopResult);
      if (e.type === "done") {
        if (!finished) {
          finished = true;
          setRunning(false);
          onDone(e.passed !== false);
        }
      }
      if (e.type === "error") {
        setError(String(e.error ?? "未知错误"));
        if (!finished) {
          finished = true;
          setRunning(false);
        }
      }
    }).catch((err: Error) => {
      setError(err.message);
      if (!finished) {
        finished = true;
        setRunning(false);
      }
    });
  }, [novelId, chapterNumber, onDone]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [events]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-lg border border-subtle bg-surface-card shadow-xl">
        <div className="flex items-center justify-between border-b border-subtle px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-accent" />
            <h3 className="font-heading text-sm font-semibold text-fg-primary">
              章节写作循环
            </h3>
            {chapterNumber && (
              <span className="font-caption text-[11px] text-fg-muted">
                第 {chapterNumber} 章
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={running}
            className="text-fg-muted transition-colors hover:text-fg-primary disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        <div
          ref={logRef}
          className="max-h-80 overflow-auto px-4 py-3 space-y-1"
        >
          {events.length === 0 && (
            <div className="font-caption text-xs text-fg-muted">等待开始...</div>
          )}
          {events.map((e, i) => (
            <div key={i} className="font-caption text-xs leading-relaxed">
              {renderEvent(e)}
            </div>
          ))}
          {error && (
            <div className="font-caption text-xs text-error">错误：{error}</div>
          )}
        </div>

        {result && (
          <div className="border-t border-subtle px-4 py-2.5 flex items-center gap-2">
            {result.passed ? (
              <CheckCircle2 size={16} className="text-success" />
            ) : (
              <XCircle size={16} className="text-error" />
            )}
            <span className="font-body text-sm text-fg-primary">
              {result.passed
                ? `通过（${result.rounds} 轮）`
                : `${result.rounds} 轮未通过`}
              {result.finalVerdict?.grade
                ? ` · 评分 ${result.finalVerdict.grade}`
                : ""}
              {result.entitiesUpdated
                ? ` · 实体状态更新 ${result.entitiesUpdated}`
                : ""}
            </span>
          </div>
        )}

        <div className="flex justify-end border-t border-subtle px-4 py-2.5">
          <button
            onClick={onClose}
            disabled={running}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-body text-xs font-medium text-white transition-colors hover:bg-accent-deep disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running && <Loader2 size={13} className="animate-spin" />}
            {running ? "运行中" : "关闭"}
          </button>
        </div>
      </div>
    </div>
  );
}

function renderEvent(e: WritingLoopEvent): string {
  switch (e.type) {
    case "start":
      return `▶ 开始第 ${e.chapterNumber ?? "?"} 章`;
    case "progress": {
      const phase = e.phase ?? "";
      const round = e.round ?? "";
      const msg = e.message ?? "";
      const proseData = e.prose as { blocking?: number; advisory?: number } | undefined;
      const verdictData = e.verdict as
        | { grade?: string | null; severe?: number; normal?: number }
        | undefined;
      const prose = proseData
        ? ` (blocking=${proseData.blocking}, advisory=${proseData.advisory})`
        : "";
      const v = verdictData
        ? ` · verdict: ${verdictData.grade ?? "?"}/${verdictData.severe ?? 0}/${verdictData.normal ?? 0}`
        : "";
      return `[${phase}${round ? `/${round}` : ""}] ${msg}${prose}${v}`;
    }
    case "milestone":
      return `★ 里程碑：${e.message ?? ""}`;
    case "result":
      return "";
    case "done":
      return e.error ? `✗ ${e.error}` : "✓ 完成";
    case "error":
      return `✗ ${e.error}`;
    default:
      return JSON.stringify(e);
  }
}
