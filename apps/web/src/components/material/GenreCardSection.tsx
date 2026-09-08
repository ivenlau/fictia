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
              className={`group cursor-pointer rounded-lg border px-3 py-2.5 transition-all duration-150 ${
                selected
                  ? "border-accent/60 bg-accent/10 shadow-glow"
                  : "border-subtle bg-surface-card hover-lift hover:border-strong hover:bg-surface-elevated"
              }`}
              onClick={() => setPreview(card)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-body text-[13px] font-semibold text-fg-primary">
                  {card.name}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  {selected && (
                    <span className="flex items-center gap-0.5 text-accent" title="当前选中">
                      <Check size={12} />
                    </span>
                  )}
                  <span className="flex items-center gap-1 rounded-md bg-surface-inset px-1.5 py-0.5 font-caption text-[10px] text-fg-muted opacity-0 transition-opacity group-hover:opacity-100">
                    <Eye size={11} />
                    预览
                  </span>
                </div>
              </div>
              {card.description && (
                <p className="mt-1 line-clamp-2 font-body text-[11px] leading-relaxed text-fg-muted">
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
                className="flex items-center gap-1 rounded-md border border-subtle bg-surface-card px-3 py-1.5 font-body text-xs text-fg-secondary transition-colors hover:border-strong hover:bg-surface-elevated hover:text-fg-primary"
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
                className="rounded-md bg-accent px-3 py-1.5 font-body text-xs font-semibold text-accent-ink transition-all hover:bg-accent-light active:scale-[0.97] disabled:opacity-40"
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
