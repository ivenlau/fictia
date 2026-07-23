import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardList, Loader2 } from "lucide-react";
import { materialsApi, type UserMaterial } from "@/api/materials";

interface SnippetPickerProps {
  novelId: string | undefined;
  disabled?: boolean;
  /** 选定片段后回调，把内容插入到输入框。 */
  onInsert: (content: string) => void;
}

/**
 * C2 提示词片段选择器：在 chat（及未来的 brainstorm）输入框旁，
 * 一键把已保存的片段内容追加进去。片段本身不自动注入流水线。
 */
export function SnippetPicker({ novelId, disabled, onInsert }: SnippetPickerProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UserMaterial[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!novelId) return;
    setLoading(true);
    try {
      const res = await materialsApi.listUserMaterials(novelId, "prompt-snippet");
      setItems(res.entries);
    } catch {
      setItems([]);
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

  const pick = (m: UserMaterial) => {
    onInsert(m.content);
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || !novelId}
        title="插入提示词片段"
        className="p-1.5 rounded-md text-fg-muted hover:text-fg-primary hover:bg-surface-secondary disabled:opacity-30 transition-colors"
      >
        <ClipboardList size={14} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-64 bg-surface-card border border-subtle rounded-md shadow-lg z-20 max-h-72 overflow-y-auto">
          <div className="px-2.5 py-1.5 border-b border-subtle">
            <span className="font-caption text-[10px] uppercase tracking-wider text-fg-muted">
              提示词片段
            </span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-4 text-fg-muted">
              <Loader2 size={14} className="animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="px-2.5 py-3">
              <p className="font-caption text-[10px] text-fg-muted">暂无片段。</p>
              <p className="font-caption text-[10px] text-fg-muted mt-0.5">
                在「素材库 → 提示词」里新建。
              </p>
            </div>
          ) : (
            items.map((m) => (
              <button
                key={m.key}
                onClick={() => pick(m)}
                className="w-full text-left px-2.5 py-1.5 hover:bg-surface-secondary transition-colors border-b border-subtle last:border-b-0"
              >
                <div className="font-body text-xs font-medium text-fg-primary truncate">
                  {m.name}
                </div>
                {m.description && (
                  <div className="font-caption text-[10px] text-fg-muted truncate">
                    {m.description}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
