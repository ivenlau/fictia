import { useCallback, useEffect, useState } from "react";
import { Eye, Loader2, RefreshCw } from "lucide-react";
import {
  knowledgeApi,
  type ForeshadowStats,
  type ForeshadowState,
} from "@/api/knowledge";

const STATE_META: Record<ForeshadowState, { label: string; chip: string }> = {
  planted: { label: "已埋设", chip: "bg-amber-500/15 text-amber-300" },
  strengthened: { label: "已推进", chip: "bg-sky-500/15 text-sky-300" },
  resolved: { label: "已回收", chip: "bg-emerald-500/15 text-emerald-300" },
  suspended: { label: "悬置", chip: "bg-fg-muted/15 text-fg-muted" },
};

const ORDER: ForeshadowState[] = ["planted", "strengthened", "resolved", "suspended"];

/**
 * 伏笔看板：闭合率 + 各态计数 + 未闭合（open）列表。
 * 数据来自后端 foreshadowStats（基于实体库 foreshadowing 集合 + 状态机）。
 */
export function ForeshadowingDashboard({ novelId }: { novelId: string }) {
  const [stats, setStats] = useState<ForeshadowStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await knowledgeApi.foreshadowStats(novelId));
    } catch (err: any) {
      setError(err?.message ?? "加载伏笔统计失败");
    } finally {
      setLoading(false);
    }
  }, [novelId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-fg-muted">
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }
  if (error) {
    return <div className="px-3 py-4 text-xs text-error">{error}</div>;
  }
  if (!stats) return null;

  const pct = Math.round(stats.closureRate * 100);
  const empty = stats.total === 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2 border-b border-subtle flex items-center justify-between">
        <span className="font-caption text-[10px] uppercase tracking-wider text-fg-muted">
          伏笔闭合
        </span>
        <button
          onClick={() => void load()}
          className="text-fg-muted hover:text-fg-primary transition-colors"
          title="刷新"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {empty ? (
        <div className="flex flex-col items-center justify-center px-6 py-10 text-center text-fg-muted">
          <Eye size={20} className="mb-2 opacity-40" />
          <p className="font-caption text-[11px]">暂无伏笔。叙事编织后并写出章节，这里会显示闭合情况。</p>
        </div>
      ) : (
        <div className="p-3 flex flex-col gap-3">
          {/* closure rate */}
          <div className="rounded-md border border-subtle px-3 py-2.5">
            <div className="flex items-end justify-between">
              <div>
                <p className="font-caption text-[10px] uppercase tracking-wider text-fg-muted">
                  闭合率
                </p>
                <p className="font-body text-2xl font-semibold text-fg-primary leading-tight">
                  {pct}
                  <span className="text-sm text-fg-muted">%</span>
                </p>
              </div>
              <p className="font-caption text-[10px] text-fg-muted">
                {stats.resolved}/{stats.total} 已回收
              </p>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-surface-muted overflow-hidden">
              <div
                className="h-full bg-emerald-500/70 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* state buckets */}
          <div className="grid grid-cols-2 gap-1.5">
            {ORDER.map((st) => {
              const meta = STATE_META[st];
              const count = stats[st];
              return (
                <div
                  key={st}
                  className="rounded-md border border-subtle px-2.5 py-1.5 flex items-center justify-between"
                >
                  <span className={`font-caption text-[10px] px-1.5 py-0.5 rounded ${meta.chip}`}>
                    {meta.label}
                  </span>
                  <span className="font-body text-xs font-medium text-fg-primary">{count}</span>
                </div>
              );
            })}
          </div>

          {/* open list */}
          <div>
            <p className="font-caption text-[10px] uppercase tracking-wider text-fg-muted mb-1.5 px-1">
              未闭合（{stats.open.length}）
            </p>
            {stats.open.length === 0 ? (
              <p className="font-caption text-[10px] text-fg-muted px-1">
                所有伏笔均已回收或悬置 🎉
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {stats.open.map((f) => {
                  const meta = STATE_META[f.state];
                  return (
                    <div
                      key={f.id}
                      className="rounded-md border border-subtle px-2.5 py-1.5"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-body text-xs font-medium text-fg-primary">
                          {f.id} {f.name}
                        </span>
                        <span className={`font-caption text-[9px] px-1 py-0.5 rounded ${meta.chip}`}>
                          {meta.label}
                        </span>
                      </div>
                      {f.desc && (
                        <p className="font-caption text-[10px] text-fg-muted mt-0.5 line-clamp-2">
                          {f.desc}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
