import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { materialsApi, type InjectionPreview as Preview } from "@/api/materials";

/**
 * 注入预览 tab：选一个 agent，看当前启用的素材（体裁卡 / 写作技法 / 风格锚定）
 * 是怎么拼进它的 system prompt 的。让用户直观看到素材在起作用。
 */
export function InjectionPreviewSection({ novelId }: { novelId: string }) {
  const [agents, setAgents] = useState<string[]>([]);
  const [agent, setAgent] = useState("chapter-writer");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFull, setShowFull] = useState(false);

  useEffect(() => {
    void materialsApi
      .agents()
      .then((r) => {
        setAgents(r.agents);
        if (r.agents.length && !r.agents.includes(agent)) setAgent(r.agents[0]);
      })
      .catch(() => setAgents([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await materialsApi.injectionPreview(novelId, agent);
      setPreview(p);
    } catch (err: any) {
      setError(err?.message ?? "加载注入预览失败");
    } finally {
      setLoading(false);
    }
  }, [novelId, agent]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2 border-b border-subtle flex flex-col gap-1.5">
        <label className="font-caption text-[10px] uppercase tracking-wider text-fg-muted">
          Agent
        </label>
        <select
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
          className="font-body text-xs bg-surface-secondary border border-subtle rounded-md px-2 py-1.5 text-fg-primary focus:outline-none focus:border-accent"
        >
          {agents.length === 0 && <option value={agent}>{agent}</option>}
          {agents.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        {preview && (
          <p className="font-caption text-[10px] text-fg-muted">
            体裁卡：{preview.genreCard ?? "未选择"}
            {preview.genreCard === null && preview.genre ? `（回退自由文本：${preview.genre}）` : ""}
            {" · "}总长 {preview.totalChars.toLocaleString()} 字符
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-fg-muted">
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : error ? (
        <div className="px-3 py-4 text-xs text-error">{error}</div>
      ) : preview ? (
        <div className="p-2 flex flex-col gap-1.5">
          {preview.sections.map((s) => (
            <div
              key={s.key}
              className="rounded-md border border-subtle px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-body text-xs font-medium text-fg-primary">{s.title}</span>
                <span
                  className={`font-caption text-[10px] px-1.5 py-0.5 rounded ${
                    s.present
                      ? "bg-accent-bg text-accent"
                      : "bg-surface-muted text-fg-muted"
                  }`}
                >
                  {s.present ? `${s.charCount.toLocaleString()} 字` : "未加载"}
                </span>
              </div>
              <p className="font-caption text-[10px] text-fg-muted mt-1">{s.detail}</p>
            </div>
          ))}

          <button
            onClick={() => setShowFull((v) => !v)}
            className="flex items-center gap-1 font-caption text-[10px] text-accent hover:underline mt-1 px-1"
          >
            {showFull ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {showFull ? "收起" : "展开"}完整 system prompt
          </button>

          {showFull && (
            <pre className="font-caption text-[10px] leading-relaxed bg-surface-muted text-fg-secondary p-2.5 rounded-md overflow-x-auto whitespace-pre-wrap break-words border border-subtle">
              {preview.assembledPrompt}
            </pre>
          )}
        </div>
      ) : null}
    </div>
  );
}
