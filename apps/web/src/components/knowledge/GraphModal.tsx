import { useEffect, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { Loader2, X } from "lucide-react";
import { ModalOverlay } from "@/components/layout/ModalOverlay";
import { knowledgeApi, type GraphExport } from "@/api/knowledge";

interface GraphModalProps {
  novelId: string;
  onClose: () => void;
}

export function GraphModal({ novelId, onClose }: GraphModalProps) {
  const [data, setData] = useState<GraphExport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 560 });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    knowledgeApi
      .graphExport(novelId)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [novelId]);

  // 让 ForceGraph2D 适配弹窗容器尺寸
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const graphData = {
    nodes: (data?.nodes ?? []).map((n) => ({ id: n.id, name: n.name })),
    links: (data?.edges ?? []).map((e) => ({
      source: e.source,
      target: e.target,
      rel_type: e.rel_type,
      text: e.text,
      chapter: e.chapter,
    })),
  };

  const isEmpty = !loading && !error && (data?.nodes.length ?? 0) === 0;

  return (
    <ModalOverlay onClose={onClose}>
      <div className="w-[min(92vw,960px)] h-[min(86vh,680px)] rounded-lg border border-subtle bg-surface-card shadow-xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-subtle px-4 py-3">
          <h3 className="font-heading text-sm font-semibold text-fg-primary">
            知识图谱
          </h3>
          <button
            onClick={onClose}
            className="text-fg-muted transition-colors hover:text-fg-primary"
          >
            <X size={16} />
          </button>
        </div>
        <div ref={containerRef} className="relative flex-1 bg-surface-secondary">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-fg-muted">
              <Loader2 size={16} className="animate-spin" />
              <span className="font-caption text-xs">加载图谱...</span>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-caption text-xs text-error">
                错误：{error}
              </span>
            </div>
          )}
          {isEmpty && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-caption text-xs text-fg-muted">
                暂无关系数据，请先构建图谱
              </span>
            </div>
          )}
          {!loading && !error && !isEmpty && (
            <ForceGraph2D
              graphData={graphData}
              width={size.width}
              height={size.height}
              nodeLabel={(node: { name?: string; id?: string }) =>
                node?.name ?? node?.id ?? ""
              }
              nodeAutoColorBy="id"
              nodeRelSize={5}
              linkDirectionalArrowLength={4}
              linkDirectionalArrowRelPos={1}
              linkLabel={(link: { rel_type?: string; text?: string }) =>
                link?.rel_type
                  ? `${link.rel_type}${link.text ? `：${link.text}` : ""}`
                  : ""
              }
              backgroundColor="rgba(0,0,0,0)"
            />
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
