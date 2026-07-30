import { useState } from "react";
import { X, FastForward } from "lucide-react";
import type { AutopilotOptions } from "@/api/writing-loop";

interface AutopilotDialogProps {
  /** 固定起始章（已写章数 + 1，不可调）。 */
  startChapter: number;
  /** 结束章上限（目标章数 targetChapters）。 */
  maxChapter: number;
  onClose: () => void;
  /** 确认开始：传出 options，由调用方接管 SSE + 状态（关闭弹窗 + 后台跑）。 */
  onConfirm: (options: AutopilotOptions) => void;
}

export function AutopilotDialog({ startChapter, maxChapter, onClose, onConfirm }: AutopilotDialogProps) {
  const [endChapter, setEndChapter] = useState(maxChapter);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg border border-subtle bg-surface-card shadow-xl">
        <div className="flex items-center justify-between border-b border-subtle px-4 py-3">
          <div className="flex items-center gap-2">
            <FastForward size={15} className="text-accent" />
            <h3 className="font-heading text-sm font-semibold text-fg-primary">自动驾驶</h3>
          </div>
          <button onClick={onClose} className="text-fg-muted transition-colors hover:text-fg-primary">
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          <p className="font-body text-xs text-fg-secondary">
            连续自动写多章（写作循环 + 审核修复），每 5 章自动做一致性校验，未通过则暂停。开始后弹窗关闭，后台执行，按钮显示「自动驾驶...」。
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
                value={endChapter}
                onChange={(e) => setEndChapter(Number(e.target.value))}
              />
            </label>
            <span className="font-caption text-[10px] text-fg-muted">最大 {maxChapter}</span>
          </div>
          <button
            onClick={() => onConfirm({ startChapter, endChapter })}
            className="w-full rounded-md bg-accent text-white py-1.5 text-xs hover:bg-accent/90 transition-colors"
          >
            开始自动驾驶
          </button>
        </div>
      </div>
    </div>
  );
}
