import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { knowledgeApi, type ContextPreview } from "@/api/knowledge";

/**
 * 上下文注入预览：选章节号，看写作时实际注入的动态上下文 section
 *（前文摘要链 / 角色当前状态 / 本章伏笔指令）。让用户直观看到摘要链在起作用。
 */
export function ContextPreviewSection({ novelId }: { novelId: string }) {
  const [chapter, setChapter] = useState(1);
  const [preview, setPreview] = useState<ContextPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPreview(await knowledgeApi.contextPreview(novelId, chapter));
    } catch (err: any) {
      setError(err?.message ?? "加载上下文预览失败");
    } finally {
      setLoading(false);
    }
  }, [novelId, chapter]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasSections = (preview?.sections ?? []).some((s) => s.present);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2 border-b border-subtle flex flex-col gap-1.5">
        <label className="font-caption text-[10px] uppercase tracking-wider text-fg-muted">
          预览第几章的注入上下文
        </label>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setChapter((c) => Math.max(1, c - 1))}
            className="px-1.5 py-1 rounded-md border border-subtle text-fg-muted hover:text-fg-primary hover:bg-surface-secondary text-xs"
          >
            −
          </button>
          <input
            type="number"
            min={1}
            value={chapter}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= 1) setChapter(n);
            }}
            className="font-body text-xs bg-surface-secondary border border-subtle rounded-md px-2 py-1.5 text-fg-primary w-16 focus:outline-none focus:border-accent"
          />
          <button
            onClick={() => setChapter((c) => c + 1)}
            className="px-1.5 py-1 rounded-md border border-subtle text-fg-muted hover:text-fg-primary hover:bg-surface-secondary text-xs"
          >
            +
          </button>
        </div>
        {preview && (
          <p className="font-caption text-[10px] text-fg-muted">
            {hasSections ? "以下为写作该章时注入的动态上下文" : "该章暂无可注入的动态上下文（无前文摘要/角色状态/伏笔指令）"}
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-fg-muted">
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : error ? (
        <div className="px-3 py-4 text-xs text-error">{error}</div>
      ) : preview && preview.sections.length > 0 ? (
        <div className="p-2 flex flex-col gap-1.5">
          {preview.sections.map((s) => (
            <div key={s.key} className="rounded-md border border-subtle px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-body text-xs font-medium text-fg-primary">{s.title}</span>
                <span
                  className={`font-caption text-[10px] px-1.5 py-0.5 rounded ${
                    s.present ? "bg-accent-bg text-accent" : "bg-surface-muted text-fg-muted"
                  }`}
                >
                  {s.present ? `${s.charCount.toLocaleString()} 字` : "未加载"}
                </span>
              </div>
              <p className="font-caption text-[10px] text-fg-muted mt-1 whitespace-pre-wrap">
                {s.detail}
              </p>
            </div>
          ))}

          <button
            onClick={() => setShowRaw((v) => !v)}
            className="flex items-center gap-1 font-caption text-[10px] text-accent hover:underline mt-1 px-1"
          >
            {showRaw ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {showRaw ? "收起" : "展开"}完整注入文本
          </button>
          {showRaw && (
            <pre className="font-caption text-[10px] leading-relaxed bg-surface-muted text-fg-secondary p-2.5 rounded-md overflow-x-auto whitespace-pre-wrap break-words border border-subtle">
              {preview.raw}
            </pre>
          )}
        </div>
      ) : null}
    </div>
  );
}
