import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Eye, Loader2 } from "lucide-react";
import { materialsApi, type CatalogEntry } from "@/api/materials";
import { novelsApi } from "@/api/novels";
import { MaterialPreviewModal } from "./MaterialPreviewModal";
import { UserMaterialsManager } from "./UserMaterialsManager";

/**
 * 体裁卡 tab：浏览 8 张内置体裁卡，选择本作使用的卡（写 meta.json.genreCard），
 * 或克隆内置卡为本作自定义卡（可魔改；删除即回退内置）。
 */
export function GenreCardSection({ novelId }: { novelId: string }) {
  const [cards, setCards] = useState<CatalogEntry[]>([]);
  const [genreCard, setGenreCard] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CatalogEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [cloneRefresh, setCloneRefresh] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cat, meta] = await Promise.all([
        materialsApi.catalog("genre-card"),
        novelsApi.getMeta(novelId),
      ]);
      setCards(cat.entries);
      setGenreCard(typeof meta.genreCard === "string" ? meta.genreCard : null);
    } catch (err: any) {
      setError(err?.message ?? "加载体裁卡失败");
    } finally {
      setLoading(false);
    }
  }, [novelId]);

  useEffect(() => {
    void load();
  }, [load]);

  const select = async (key: string) => {
    setSaving(true);
    try {
      await novelsApi.setGenreCard(novelId, key);
      setGenreCard(key);
    } catch (err: any) {
      setError(err?.message ?? "设置体裁卡失败");
    } finally {
      setSaving(false);
    }
  };

  const clone = async (key: string) => {
    setSaving(true);
    try {
      await materialsApi.cloneBuiltin(novelId, "genre-card", key);
      setCloneRefresh((n) => n + 1);
      setPreview(null);
    } catch (err: any) {
      setError(err?.message ?? "克隆失败");
    } finally {
      setSaving(false);
    }
  };

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
          当前体裁：
          <span className="text-fg-primary font-medium">
            {genreCard
              ? cards.find((c) => c.key === genreCard)?.name ?? genreCard
              : "未选择"}
          </span>
        </p>
        <p className="font-caption text-[10px] text-fg-muted mt-0.5">
          选卡后，写作相关 agent 会自动加载该卡（替代脆弱的自由文本体裁）。
        </p>
      </div>

      <div className="p-2 grid grid-cols-1 gap-1.5">
        {cards.map((card) => {
          const selected = card.key === genreCard;
          return (
            <div
              key={card.key}
              className={`group rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                selected
                  ? "border-accent/60 bg-accent-bg"
                  : "border-subtle hover:border-accent/40 hover:bg-surface-secondary"
              }`}
              onClick={() => setPreview(card)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-body text-xs font-medium text-fg-primary truncate">
                  {card.name}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {selected && (
                    <span className="flex items-center gap-0.5 text-accent" title="当前选中">
                      <Check size={12} />
                    </span>
                  )}
                  <Eye
                    size={12}
                    className="text-fg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </div>
              </div>
              {card.description && (
                <p className="font-caption text-[10px] text-fg-muted mt-0.5 line-clamp-2">
                  {card.description}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {preview && (
        <MaterialPreviewModal
          title={preview.name}
          description={preview.description}
          content={preview.content}
          onClose={() => setPreview(null)}
          footer={
            <>
              <span className="font-caption text-[10px] text-fg-muted mr-auto">
                key: {preview.key}
              </span>
              <button
                disabled={saving}
                onClick={() => void clone(preview.key)}
                title="克隆一份本作可编辑副本（不改动内置）"
                className="flex items-center gap-1 font-body text-xs px-3 py-1.5 rounded-md border border-subtle text-fg-secondary hover:bg-surface-secondary transition-colors"
              >
                <Copy size={12} />
                克隆为本作卡
              </button>
              <button
                disabled={saving || preview.key === genreCard}
                onClick={() => {
                  void select(preview.key);
                  setPreview(null);
                }}
                className="font-body text-xs px-3 py-1.5 rounded-md bg-accent text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {preview.key === genreCard ? "已选为本作体裁" : "设为本作体裁"}
              </button>
            </>
          }
        />
      )}

      <UserMaterialsManager novelId={novelId} type="genre-card" refreshKey={cloneRefresh} />
    </div>
  );
}
