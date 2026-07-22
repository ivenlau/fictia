import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Zap, Database, Layers } from "lucide-react";
import {
  knowledgeApi,
  runVectorIndex,
  INDEXED_VECTOR_COLLECTIONS,
  ENTITY_COLLECTIONS,
  type CollectionStats,
  type VectorIndexEvent,
} from "@/api/knowledge";
import { settingsApi } from "@/api/settings";

interface IndexManagerProps {
  novelId: string;
}

export function IndexManager({ novelId }: IndexManagerProps) {
  const [vectorStats, setVectorStats] = useState<CollectionStats | null>(null);
  const [entityStats, setEntityStats] = useState<CollectionStats | null>(null);
  const [indexProvider, setIndexProvider] = useState<string | null>(null);
  const [embeddingProvider, setEmbeddingProvider] = useState<"glm" | "bge-m3">("glm");
  const [vectorIndexing, setVectorIndexing] = useState(false);
  const [entityIndexing, setEntityIndexing] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const busy = vectorIndexing || entityIndexing;

  const refresh = useCallback(async () => {
    try {
      const [v, e] = await Promise.all([
        knowledgeApi.vectorStatus(novelId),
        knowledgeApi.entityStatus(novelId),
      ]);
      setVectorStats(v.collections);
      setIndexProvider(v.indexProvider ?? null);
      setEntityStats(e.collections);
    } catch {
      // 忽略：状态查询失败不阻塞 UI
    }
  }, [novelId]);

  useEffect(() => {
    refresh();
    settingsApi
      .get()
      .then((s) => setEmbeddingProvider(s.embeddingProvider))
      .catch(() => {});
  }, [refresh]);

  const handleSwitchProvider = useCallback(
    async (p: "glm" | "bge-m3") => {
      if (p === embeddingProvider || busy) return;
      try {
        await settingsApi.update({ embeddingProvider: p });
        setEmbeddingProvider(p);
      } catch (err) {
        setError(err instanceof Error ? err.message : "切换 embedding 失败");
      }
    },
    [embeddingProvider, busy],
  );

  const handleVectorIndex = useCallback(async () => {
    setVectorIndexing(true);
    setEvents([]);
    setError(null);
    try {
      await runVectorIndex(novelId, (ev: VectorIndexEvent) => {
        if (ev.type === "progress" && ev.message)
          setEvents((p) => [...p, String(ev.message)]);
        if (ev.type === "error")
          setError(String(ev.error ?? "索引失败"));
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "索引失败");
    } finally {
      setVectorIndexing(false);
    }
  }, [novelId, refresh]);

  const handleEntityIndex = useCallback(async () => {
    setEntityIndexing(true);
    setError(null);
    try {
      await knowledgeApi.entityIndex(novelId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "实体索引失败");
    } finally {
      setEntityIndexing(false);
    }
  }, [novelId, refresh]);

  return (
    <div className="px-3 py-2 border-b border-subtle">
      <p className="font-caption text-[11px] font-semibold uppercase tracking-wider text-fg-muted mb-2">
        索引管理
      </p>

      {/* Embedding provider 切换 */}
      <div className="mb-2">
        <div className="flex items-center gap-0.5 rounded-md bg-surface-secondary p-0.5">
          {(["glm", "bge-m3"] as const).map((p) => (
            <button
              key={p}
              onClick={() => handleSwitchProvider(p)}
              disabled={busy}
              className={`flex-1 rounded px-2 py-1 font-body text-[11px] transition-colors disabled:opacity-50 ${
                embeddingProvider === p
                  ? "bg-surface-card text-fg-primary"
                  : "text-fg-muted hover:text-fg-primary"
              }`}
            >
              {p === "glm" ? "GLM" : "本地 bge-m3"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 mt-1 font-caption text-[10px] text-fg-muted">
          <span>当前: {embeddingProvider === "glm" ? "GLM" : "bge-m3"}</span>
          <span>·</span>
          <span>已索引: {indexProvider ?? "无"}</span>
        </div>
        {indexProvider && indexProvider !== embeddingProvider && (
          <p className="font-caption text-[10px] text-amber-600 mt-1">
            ⚠ 索引({indexProvider})与当前({embeddingProvider})不一致，请重新全量索引
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <button
          onClick={handleVectorIndex}
          disabled={busy}
          className="flex items-center justify-center gap-1 rounded-md bg-accent px-2 py-1.5 font-body text-[11px] font-medium text-white transition-colors hover:bg-accent-deep disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {vectorIndexing ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Zap size={12} />
          )}
          全量索引
        </button>
        <button
          onClick={handleEntityIndex}
          disabled={busy}
          className="flex items-center justify-center gap-1 rounded-md border border-subtle bg-surface-card px-2 py-1.5 font-body text-[11px] font-medium text-fg-primary transition-colors hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {entityIndexing ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Database size={12} />
          )}
          实体索引
        </button>
        <button
          disabled
          title="敬请期待（后端尚未实现增量索引）"
          className="flex items-center justify-center gap-1 rounded-md border border-subtle bg-surface-card px-2 py-1.5 font-body text-[11px] font-medium text-fg-muted opacity-50 cursor-not-allowed"
        >
          <Layers size={12} />
          增量索引
        </button>
      </div>

      <button
        onClick={refresh}
        disabled={busy}
        className="flex items-center gap-1 font-caption text-[10px] text-fg-muted hover:text-fg-primary mb-2 disabled:opacity-40"
      >
        <RefreshCw size={10} />
        刷新状态
      </button>

      {(events.length > 0 || vectorIndexing) && (
        <div className="mb-2 max-h-24 overflow-auto rounded bg-surface-secondary px-2 py-1.5 space-y-0.5">
          {events.length === 0 && (
            <p className="font-caption text-[10px] text-fg-muted">等待开始...</p>
          )}
          {events.map((e, i) => (
            <p
              key={i}
              className="font-caption text-[10px] text-fg-secondary leading-relaxed"
            >
              {e}
            </p>
          ))}
        </div>
      )}
      {error && (
        <p className="font-caption text-[10px] text-error mb-2">{error}</p>
      )}

      {/* 状态展示 */}
      <div className="space-y-1">
        {vectorStats && (
          <div className="flex flex-wrap gap-1">
            {INDEXED_VECTOR_COLLECTIONS.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1 rounded bg-surface-secondary px-1.5 py-0.5 font-caption text-[10px] text-fg-secondary"
              >
                {c}
                <span className="text-fg-primary font-medium">
                  {vectorStats[c] ?? 0}
                </span>
              </span>
            ))}
          </div>
        )}
        {entityStats && (
          <div className="flex flex-wrap gap-1">
            {ENTITY_COLLECTIONS.filter((c) => (entityStats[c] ?? 0) > 0).map(
              (c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1 rounded bg-surface-secondary px-1.5 py-0.5 font-caption text-[10px] text-fg-secondary"
                >
                  {c}
                  <span className="text-fg-primary font-medium">
                    {entityStats[c] ?? 0}
                  </span>
                </span>
              ),
            )}
            {ENTITY_COLLECTIONS.every((c) => (entityStats[c] ?? 0) === 0) && (
              <span className="font-caption text-[10px] text-fg-muted">
                尚无实体
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
