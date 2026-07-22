import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { Loader2, GitBranch, Network } from "lucide-react";
import { knowledgeApi, type GraphStatus } from "@/api/knowledge";

// 图谱库（react-force-graph-2d + d3）体积较大，懒加载以减小首屏包体积。
const GraphModal = lazy(() =>
  import("./GraphModal").then((m) => ({ default: m.GraphModal })),
);

interface GraphSectionProps {
  novelId: string;
}

export function GraphSection({ novelId }: GraphSectionProps) {
  const [status, setStatus] = useState<GraphStatus | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGraph, setShowGraph] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await knowledgeApi.graphStatus(novelId));
    } catch {
      // 忽略
    }
  }, [novelId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleBuild = useCallback(async () => {
    setBuilding(true);
    setError(null);
    try {
      await knowledgeApi.graphBuild(novelId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "图谱构建失败");
    } finally {
      setBuilding(false);
    }
  }, [novelId, refresh]);

  const relations = status?.relations ?? 0;
  const hasGraph = relations > 0;
  const types = status ? Object.entries(status.types) : [];

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-2 pb-2 space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={handleBuild}
            disabled={building}
            className="flex items-center gap-1 rounded-md border border-subtle bg-surface-card px-2 py-1.5 font-body text-[11px] font-medium text-fg-primary transition-colors hover:bg-surface-secondary disabled:opacity-50"
          >
            {building ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <GitBranch size={12} />
            )}
            构建图谱
          </button>
          <button
            onClick={() => setShowGraph(true)}
            disabled={!hasGraph}
            className="flex items-center gap-1 rounded-md bg-accent px-2 py-1.5 font-body text-[11px] font-medium text-white transition-colors hover:bg-accent-deep disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Network size={12} />
            查看图谱
          </button>
        </div>
        {error && <p className="font-caption text-[10px] text-error">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {status ? (
          <div className="space-y-2">
            <div className="rounded-md bg-surface-secondary px-3 py-2">
              <p className="font-caption text-[11px] text-fg-secondary">关系总数</p>
              <p className="font-heading text-lg font-semibold text-fg-primary">
                {relations}
              </p>
            </div>
            {types.length > 0 && (
              <div>
                <p className="font-caption text-[10px] text-fg-muted mb-1">
                  关系类型分布
                </p>
                <div className="flex flex-wrap gap-1">
                  {types.map(([t, n]) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded bg-surface-secondary px-1.5 py-0.5 font-caption text-[10px] text-fg-secondary"
                    >
                      {t}
                      <span className="text-fg-primary font-medium">{n}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {!hasGraph && (
              <p className="font-caption text-[11px] text-fg-muted py-4 text-center">
                暂无关系数据。先索引实体并构建图谱。
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-6 text-fg-muted">
            <Loader2 size={14} className="animate-spin" />
            <span className="font-caption text-xs">加载状态...</span>
          </div>
        )}
      </div>

      {showGraph && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <Loader2 className="animate-spin text-fg-muted" size={20} />
            </div>
          }
        >
          <GraphModal novelId={novelId} onClose={() => setShowGraph(false)} />
        </Suspense>
      )}
    </div>
  );
}
