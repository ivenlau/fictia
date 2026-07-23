import { useCallback, useEffect, useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { materialsApi, type CatalogEntry } from "@/api/materials";
import { MaterialPreviewModal } from "./MaterialPreviewModal";
import { UserMaterialsManager } from "./UserMaterialsManager";

/**
 * 写作技法 tab：只读浏览 20 篇内置写作技法 + 本作自定义技法（块 2）。
 * 自定义技法按 agent 知识加载并入 system prompt（可选限定 agent）。
 */
export function CraftSection({ novelId }: { novelId: string }) {
  const [docs, setDocs] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CatalogEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cat = await materialsApi.catalog("craft");
      setDocs(cat.entries);
    } catch (err: any) {
      setError(err?.message ?? "加载写作技法失败");
    } finally {
      setLoading(false);
    }
  }, []);

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

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2 border-b border-subtle">
        <p className="font-body text-xs text-fg-secondary">
          {docs.length} 篇内置写作技法
        </p>
        <p className="font-caption text-[10px] text-fg-muted mt-0.5">
          每个 agent 按其「知识加载」表自动加载相关技法，无需手动开启。
        </p>
      </div>

      <div className="p-2 flex flex-col gap-1">
        {docs.map((doc) => (
          <div
            key={doc.key}
            className="group rounded-md border border-subtle px-3 py-2 cursor-pointer hover:border-accent/40 hover:bg-surface-secondary transition-colors"
            onClick={() => setPreview(doc)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-body text-xs font-medium text-fg-primary truncate">
                {doc.name}
              </span>
              <Eye
                size={12}
                className="text-fg-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              />
            </div>
            {doc.description && (
              <p className="font-caption text-[10px] text-fg-muted mt-0.5 line-clamp-2">
                {doc.description}
              </p>
            )}
          </div>
        ))}
      </div>

      {preview && (
        <MaterialPreviewModal
          title={preview.name}
          description={preview.description}
          content={preview.content}
          onClose={() => setPreview(null)}
          footer={
            <span className="font-caption text-[10px] text-fg-muted mr-auto">
              key: {preview.key}（只读内置）
            </span>
          }
        />
      )}

      <UserMaterialsManager novelId={novelId} type="craft" />
    </div>
  );
}
