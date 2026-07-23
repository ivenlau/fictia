import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { materialsApi, type UserMaterial, type UserMaterialType } from "@/api/materials";
import { MaterialEditorModal } from "./MaterialEditorModal";

const TYPE_LABEL: Record<UserMaterialType, string> = {
  craft: "自定义技法",
  "genre-card": "自定义体裁卡",
  "prompt-snippet": "提示词片段",
};

interface Props {
  novelId: string;
  type: UserMaterialType;
  /** 外部动作（如克隆）后触发刷新。 */
  refreshKey?: number;
}

/** 自定义素材管理：列表 + 新建/编辑/删除/启停。craft 与 genre-card 共用。 */
export function UserMaterialsManager({ novelId, type, refreshKey }: Props) {
  const [items, setItems] = useState<UserMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserMaterial | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await materialsApi.listUserMaterials(novelId, type);
      setItems(res.entries);
    } catch (err: any) {
      setError(err?.message ?? "加载失败");
    } finally {
      setLoading(false);
    }
  }, [novelId, type]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const toggle = async (m: UserMaterial) => {
    try {
      await materialsApi.updateUserMaterial(novelId, type, m.key, { enabled: !m.enabled });
      void load();
    } catch (err: any) {
      setError(err?.message ?? "切换失败");
    }
  };

  const remove = async (m: UserMaterial) => {
    if (!confirm(`删除「${m.name}」？`)) return;
    try {
      await materialsApi.deleteUserMaterial(novelId, type, m.key);
      void load();
    } catch (err: any) {
      setError(err?.message ?? "删除失败");
    }
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-subtle mt-1">
        <span className="font-caption text-[10px] uppercase tracking-wider text-fg-muted">
          {TYPE_LABEL[type]}（本作）
        </span>
        <button
          onClick={() => setEditing("new")}
          className="flex items-center gap-1 font-body text-[11px] text-accent hover:underline"
        >
          <Plus size={12} />
          新建
        </button>
      </div>

      {loading ? null : error ? (
        <div className="px-3 py-2 text-xs text-error">{error}</div>
      ) : items.length === 0 ? (
        <p className="px-3 py-2 font-caption text-[10px] text-fg-muted">
          暂无{TYPE_LABEL[type]}
        </p>
      ) : (
        <div className="px-2 pb-2 flex flex-col gap-1">
          {items.map((m) => (
            <div
              key={m.key}
              className="group rounded-md border border-subtle px-2.5 py-1.5 hover:bg-surface-secondary transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`font-body text-xs font-medium truncate ${
                    m.enabled ? "text-fg-primary" : "text-fg-muted line-through"
                  }`}
                >
                  {m.name}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {type !== "prompt-snippet" && (
                    <button
                      onClick={() => toggle(m)}
                      title={m.enabled ? "已启用，点击禁用" : "已禁用，点击启用"}
                      className={m.enabled ? "text-accent" : "text-fg-muted"}
                    >
                      {m.enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                    </button>
                  )}
                  <button
                    onClick={() => setEditing(m)}
                    title="编辑"
                    className="text-fg-muted hover:text-fg-primary opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => remove(m)}
                    title="删除"
                    className="text-fg-muted hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              {m.agents && m.agents.length > 0 && (
                <p className="font-caption text-[10px] text-fg-muted mt-0.5">
                  限定：{m.agents.join(", ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <MaterialEditorModal
          novelId={novelId}
          type={type}
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}
