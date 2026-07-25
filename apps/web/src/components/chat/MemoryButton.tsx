import { useCallback, useEffect, useRef, useState } from "react";
import { History, Loader2 } from "lucide-react";
import { novelsApi } from "@/api/novels";

interface MemoryButtonProps {
  novelId: string | undefined;
  disabled?: boolean;
}

/**
 * AI 记忆查看按钮：形式同 SnippetPicker（图标按钮 + 向上弹面板）。
 * 只读展示 AI助手/记忆.md（save_memory 工具积累的内容），不可编辑。
 */
export function MemoryButton({ novelId, disabled }: MemoryButtonProps) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!novelId) return;
    setLoading(true);
    try {
      const files = await novelsApi.getFiles(novelId);
      const mem = files.find((f) => f.path === "AI助手/记忆.md");
      setContent(mem?.content ?? null);
    } catch {
      setContent(null);
    } finally {
      setLoading(false);
    }
  }, [novelId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // 点外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || !novelId}
        title="查看 AI 记忆"
        className="p-1.5 rounded-md text-fg-muted hover:text-fg-primary hover:bg-surface-secondary disabled:opacity-30 transition-colors"
      >
        <History size={14} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-64 bg-surface-card border border-subtle rounded-md shadow-lg z-20 max-h-72 overflow-y-auto">
          <div className="px-2.5 py-1.5 border-b border-subtle">
            <span className="font-caption text-[10px] uppercase tracking-wider text-fg-muted">
              AI 记忆
            </span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-4 text-fg-muted">
              <Loader2 size={14} className="animate-spin" />
            </div>
          ) : !content ? (
            <div className="px-2.5 py-3">
              <p className="font-caption text-[10px] text-fg-muted">暂无记忆。</p>
              <p className="font-caption text-[10px] text-fg-muted mt-0.5">
                AI 会通过 save_memory 工具积累重要信息。
              </p>
            </div>
          ) : (
            <div className="px-2.5 py-2 font-caption text-[10px] text-fg-secondary whitespace-pre-wrap leading-relaxed">
              {content}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
