import { useCallback, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import {
  knowledgeApi,
  INDEXED_VECTOR_COLLECTIONS,
  type VectorCollection,
  type VectorSearchHit,
} from "@/api/knowledge";
import { useEditorStore } from "@/stores/editorStore";

interface KnowledgeSearchProps {
  novelId: string;
  novelTitle?: string;
}

export function KnowledgeSearch({ novelId, novelTitle }: KnowledgeSearchProps) {
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState<VectorCollection>("chapters");
  const [topK, setTopK] = useState(5);
  const [hits, setHits] = useState<VectorSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openFile = useEditorStore((s) => s.openFile);

  const doSearch = useCallback(
    async (q: string, col: VectorCollection, k: number) => {
      if (!q.trim()) {
        setHits([]);
        setSearched(false);
        return;
      }
      setLoading(true);
      setSearched(true);
      try {
        const data = await knowledgeApi.vectorSearch(novelId, q.trim(), col, k);
        setHits(data.hits);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    },
    [novelId],
  );

  const handleChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(value, collection, topK), 400);
    },
    [collection, topK, doSearch],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        doSearch(query, collection, topK);
      }
    },
    [query, collection, topK, doSearch],
  );

  const highlight = (text: string) => {
    const q = query.trim();
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-accent-bg text-accent rounded-sm px-0.5">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  const openHit = useCallback(
    (hit: VectorSearchHit) => {
      const p = (hit.metadata?.path as string) ?? hit.id;
      openFile({
        id: p,
        path: p,
        type: collection === "chapters" ? "chapter" : "workspace",
        label: p.split("/").pop() ?? p,
        novelId,
        novelTitle,
      });
    },
    [collection, novelId, novelTitle, openFile],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-2 pb-2 space-y-2">
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="语义检索知识..."
            className="w-full rounded-md border border-subtle bg-surface-card pl-8 pr-3 py-1.5 font-body text-xs text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={collection}
            onChange={(e) => {
              const c = e.target.value as VectorCollection;
              setCollection(c);
              if (query.trim()) doSearch(query, c, topK);
            }}
            className="flex-1 rounded-md border border-subtle bg-surface-card px-2 py-1 font-body text-[11px] text-fg-primary focus:outline-none focus:border-accent/40"
          >
            {INDEXED_VECTOR_COLLECTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={topK}
            onChange={(e) => {
              const k = Number(e.target.value);
              setTopK(k);
              if (query.trim()) doSearch(query, collection, k);
            }}
            className="rounded-md border border-subtle bg-surface-card px-2 py-1 font-body text-[11px] text-fg-primary focus:outline-none focus:border-accent/40"
          >
            <option value={3}>top 3</option>
            <option value={5}>top 5</option>
            <option value={10}>top 10</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-fg-muted">
            <Loader2 size={14} className="animate-spin" />
            <span className="font-caption text-xs">检索中...</span>
          </div>
        )}
        {!loading && searched && hits.length === 0 && (
          <p className="py-6 text-center font-caption text-xs text-fg-muted">
            未找到相关内容
          </p>
        )}
        {!loading && hits.length > 0 && (
          <div className="space-y-1">
            <p className="font-caption text-[10px] text-fg-muted px-2 py-1">
              {hits.length} 个命中
            </p>
            {hits.map((hit) => {
              const p = (hit.metadata?.path as string) ?? hit.id;
              return (
                <button
                  key={hit.id}
                  onClick={() => openHit(hit)}
                  className="w-full text-left rounded px-2 py-2 hover:bg-surface-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-caption text-xs text-fg-primary truncate">
                      {highlight(p)}
                    </span>
                    <span className="font-caption text-[10px] text-accent shrink-0">
                      {(hit.score * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="font-caption text-[11px] text-fg-secondary line-clamp-3 leading-relaxed">
                    {highlight(hit.text.slice(0, 240))}
                  </p>
                </button>
              );
            })}
          </div>
        )}
        {!searched && (
          <div className="py-6 text-center">
            <Search size={20} className="mx-auto mb-1.5 text-fg-muted/40" />
            <p className="font-caption text-[11px] text-fg-muted">
              输入问题，语义检索章节 / 设定 / 世界观
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
