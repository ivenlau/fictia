import { useCallback, useEffect, useState } from "react";
import {
  Search,
  Loader2,
  User,
  Clock,
  MapPin,
  Package,
  Calendar,
  Sparkles,
  Eye,
  type LucideIcon,
} from "lucide-react";
import {
  knowledgeApi,
  ENTITY_COLLECTIONS,
  type Entity,
  type EntityCollection,
} from "@/api/knowledge";

interface EntityBrowserProps {
  novelId: string;
}

const COLLECTION_META: Record<string, { icon: LucideIcon; label: string }> = {
  characters: { icon: User, label: "角色" },
  foreshadowing: { icon: Eye, label: "伏笔" },
  storylines: { icon: Sparkles, label: "支线" },
  timeline: { icon: Clock, label: "时间线" },
  locations: { icon: MapPin, label: "地点" },
  items: { icon: Package, label: "物品" },
  events: { icon: Calendar, label: "事件" },
  easter_eggs: { icon: Sparkles, label: "彩蛋" },
};

function fieldSummary(e: Entity): string {
  const entries = Object.entries(e.fields ?? {}).slice(0, 3);
  return entries
    .map(
      ([k, v]) =>
        `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`,
    )
    .join(" · ");
}

export function EntityBrowser({ novelId }: EntityBrowserProps) {
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState<EntityCollection | "">("");
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (q: string, col: EntityCollection | "") => {
      setLoading(true);
      try {
        const data = q.trim()
          ? await knowledgeApi.entitySearch(novelId, q.trim(), col || undefined)
          : await knowledgeApi.entityList(novelId, col || undefined);
        setEntities(data.entities);
      } catch {
        setEntities([]);
      } finally {
        setLoading(false);
      }
    },
    [novelId],
  );

  useEffect(() => {
    load("", "");
  }, [load]);

  const handleSearch = useCallback(() => {
    load(query, collection);
  }, [query, collection, load]);

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
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            placeholder="搜索实体名称 / 属性..."
            className="w-full rounded-md border border-subtle bg-surface-card pl-8 pr-3 py-1.5 font-body text-xs text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
          />
        </div>
        <select
          value={collection}
          onChange={(e) => {
            const c = e.target.value as EntityCollection | "";
            setCollection(c);
            load(query, c);
          }}
          className="w-full rounded-md border border-subtle bg-surface-card px-2 py-1 font-body text-[11px] text-fg-primary focus:outline-none focus:border-accent/40"
        >
          <option value="">全部类型</option>
          {ENTITY_COLLECTIONS.map((c) => (
            <option key={c} value={c}>
              {COLLECTION_META[c]?.label ?? c}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-fg-muted">
            <Loader2 size={14} className="animate-spin" />
            <span className="font-caption text-xs">加载中...</span>
          </div>
        )}
        {!loading && entities.length === 0 && (
          <p className="py-6 text-center font-caption text-xs text-fg-muted">
            {query.trim() ? "未找到实体" : "尚无实体，请先执行实体索引"}
          </p>
        )}
        {!loading && entities.length > 0 && (
          <div className="space-y-1">
            <p className="font-caption text-[10px] text-fg-muted px-2 py-1">
              {entities.length} 个实体
            </p>
            {entities.map((e) => {
              const meta =
                COLLECTION_META[e.collection] ??
                ({ icon: User, label: e.collection } as {
                  icon: LucideIcon;
                  label: string;
                });
              const Icon = meta.icon;
              return (
                <div
                  key={`${e.collection}-${e.id}`}
                  className="rounded px-2 py-2 hover:bg-surface-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Icon size={12} className="text-accent shrink-0" />
                    <span className="font-caption text-xs text-fg-primary truncate">
                      {e.name || e.id}
                    </span>
                    <span className="font-caption text-[10px] text-fg-muted shrink-0">
                      {meta.label}
                    </span>
                  </div>
                  {e.state && (
                    <p className="font-caption text-[10px] text-fg-secondary pl-[18px]">
                      状态：{e.state}
                    </p>
                  )}
                  {fieldSummary(e) && (
                    <p className="font-caption text-[10px] text-fg-muted pl-[18px] truncate">
                      {fieldSummary(e)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
