import { useEffect, useRef, useState } from "react";
import { Loader2, X, CheckCircle2, XCircle, FastForward } from "lucide-react";
import { runAutopilot, type WritingLoopEvent, type AutopilotOptions } from "@/api/writing-loop";

interface AutopilotDialogProps {
  novelId: string;
  /** 固定起始章（已写章数 + 1，不可调）。 */
  startChapter: number;
  /** 结束章上限（目标章数 targetChapters）。 */
  maxChapter: number;
  onClose: () => void;
  onDone?: () => void;
}

interface ChapterStatus {
  chapter: number;
  status: "writing" | "done" | "failed";
  message?: string;
}

const STOP_LABEL: Record<string, string> = {
  completed: "全部完成",
  quality: "连续质量不达标，暂停",
  milestone: "里程碑校验未通过，暂停",
  range: "达到指定章节范围",
  aborted: "已中止",
};

export function AutopilotDialog({ novelId, startChapter, maxChapter, onClose, onDone }: AutopilotDialogProps) {
  const [started, setStarted] = useState(false);
  const [running, setRunning] = useState(false);
  const [chapters, setChapters] = useState<ChapterStatus[]>([]);
  const [milestoneMsg, setMilestoneMsg] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ chaptersWritten: number; stopped: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<AutopilotOptions>({ startChapter, endChapter: maxChapter });
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!started) return;
    let finished = false;
    setRunning(true);
    runAutopilot(novelId, options, (e) => {
      if (e.type === "chapter_start") {
        setChapters((prev) => [...prev, { chapter: e.chapter as number, status: "writing" }]);
        setMilestoneMsg(null);
      } else if (e.type === "chapter_done" || e.type === "chapter_failed") {
        setChapters((prev) =>
          prev.map((c, i) =>
            i === prev.length - 1
              ? {
                  ...c,
                  status: e.type === "chapter_done" ? "done" : "failed",
                  message: e.message as string | undefined,
                }
              : c,
          ),
        );
      } else if (e.type === "milestone_start" || e.type === "milestone_done") {
        const passed = e.consistencyPassed;
        setMilestoneMsg(
          `${e.type === "milestone_start" ? "里程碑校验中" : "校验完成"}：第${e.chapter}章${
            passed !== undefined ? (passed ? "（通过）" : "（未通过）") : ""
          }`,
        );
      } else if (e.type === "done") {
        if (!finished) {
          finished = true;
          setRunning(false);
          setSummary({
            chaptersWritten: (e.chaptersWritten as number) ?? 0,
            stopped: (e.stopped as string) ?? "completed",
          });
          onDone?.();
        }
      } else if (e.type === "error") {
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
  }, [started, novelId, options, onDone]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [chapters, milestoneMsg]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-lg border border-subtle bg-surface-card shadow-xl">
        <div className="flex items-center justify-between border-b border-subtle px-4 py-3">
          <div className="flex items-center gap-2">
            <FastForward size={15} className="text-accent" />
            <h3 className="font-heading text-sm font-semibold text-fg-primary">自动驾驶</h3>
          </div>
          <button
            onClick={onClose}
            disabled={running}
            className="text-fg-muted transition-colors hover:text-fg-primary disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3 max-h-[70vh] overflow-y-auto">
          {!started && (
            <div className="space-y-3">
              <p className="font-body text-xs text-fg-secondary">
                连续自动写多章（写作循环 + 审核修复），每 5 章自动做一致性校验，未通过则暂停。
              </p>
              <div className="flex gap-3 items-center">
                <label className="font-caption text-[11px] text-fg-muted flex items-center gap-1.5">
                  起始章
                  <input
                    type="number"
                    className="w-20 rounded border border-subtle bg-surface-muted px-1.5 py-0.5 text-xs text-fg-muted"
                    value={startChapter}
                    disabled
                  />
                </label>
                <label className="font-caption text-[11px] text-fg-muted flex items-center gap-1.5">
                  结束章
                  <input
                    type="number"
                    min={startChapter}
                    max={maxChapter}
                    className="w-20 rounded border border-subtle bg-surface-muted px-1.5 py-0.5 text-xs"
                    value={options.endChapter ?? maxChapter}
                    onChange={(e) =>
                      setOptions({ ...options, endChapter: e.target.value ? Number(e.target.value) : undefined })
                    }
                  />
                </label>
                <span className="font-caption text-[10px] text-fg-muted">最大 {maxChapter}</span>
              </div>
              <button
                onClick={() => setStarted(true)}
                className="w-full rounded-md bg-accent text-white py-1.5 text-xs hover:bg-accent/90 transition-colors"
              >
                开始自动驾驶
              </button>
            </div>
          )}

          {started && (
            <>
              <div ref={logRef} className="space-y-1 max-h-56 overflow-y-auto">
                {chapters.length === 0 && (
                  <p className="font-caption text-[11px] text-fg-muted">查找下一章中...</p>
                )}
                {chapters.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 font-caption text-[11px]">
                    {c.status === "writing" && <Loader2 size={11} className="animate-spin text-accent" />}
                    {c.status === "done" && <CheckCircle2 size={11} className="text-green-600" />}
                    {c.status === "failed" && <XCircle size={11} className="text-red-600" />}
                    <span className="text-fg-primary">第 {c.chapter} 章</span>
                    <span className="text-fg-muted">
                      {c.status === "writing" ? "写作中..." : c.status === "done" ? "完成" : `失败：${c.message ?? ""}`}
                    </span>
                  </div>
                ))}
              </div>
              {milestoneMsg && (
                <p className="font-caption text-[10px] text-yellow-700 bg-yellow-500/5 rounded px-2 py-1">
                  {milestoneMsg}
                </p>
              )}
              {error && <p className="font-caption text-[11px] text-red-600">{error}</p>}
              {summary && (
                <div className="rounded border border-subtle bg-surface-muted/30 px-3 py-2">
                  <p className="font-body text-xs text-fg-primary">
                    已写 {summary.chaptersWritten} 章，{STOP_LABEL[summary.stopped] ?? summary.stopped}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
