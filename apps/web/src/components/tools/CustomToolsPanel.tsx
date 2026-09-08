import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import type { CustomToolDef } from "@fictia/shared";
import { customToolsApi } from "../../api/custom-tools";
import { CustomToolEditorModal } from "./CustomToolEditorModal";
import { useNovelStore } from "../../stores/novelStore";

/**
 * 自定义工具侧边栏面板：全局工具列表 + 启用切换 + 编辑（弹窗）+ 删除 + 新建。
 * 工具是全局资源（不绑 novel）；novelId 仅用于 js 工具测试时的 novelDir 解析。
 */
export function CustomToolsPanel() {
  const novelId = useNovelStore((s) => s.currentNovel?.id ?? "");
  const [tools, setTools] = useState<CustomToolDef[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<CustomToolDef | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      setTools(await customToolsApi.list());
    } catch (e) {
      console.warn("[custom-tools] 列表加载失败", e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void reload(); }, []);

  const toggleEnabled = async (t: CustomToolDef) => {
    try {
      const updated = await customToolsApi.update(t.id, { enabled: !t.enabled });
      setTools((arr) => arr.map((x) => (x.id === t.id ? updated : x)));
    } catch (e: any) {
      alert(e?.message ?? "切换失败");
    }
  };
  const remove = async (t: CustomToolDef) => {
    if (!confirm(`删除工具「${t.label || t.name}」？`)) return;
    try {
      await customToolsApi.remove(t.id);
      setTools((arr) => arr.filter((x) => x.id !== t.id));
    } catch (e: any) {
      alert(e?.message ?? "删除失败");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-subtle">
        <span className="font-body text-xs font-semibold text-fg-primary">自定义工具</span>
        <div className="flex items-center gap-1">
          <button onClick={reload} title="刷新" className="p-1 rounded text-fg-muted hover:bg-surface-secondary hover:text-fg-primary">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 rounded bg-accent px-2 py-1 font-caption text-[11px] font-medium text-accent-ink hover:bg-accent-light"
          >
            <Plus size={12} /> 新建
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {tools.length === 0 && (
          <p className="px-2 py-6 text-center font-caption text-[11px] text-fg-muted">
            暂无自定义工具。点「新建」手动创建，或在编辑器里用「✨ AI 生成」从自然语言生成。
          </p>
        )}
        {tools.map((t) => (
          <div key={t.id} className="rounded-md border border-subtle bg-surface-card p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-body text-xs font-medium text-fg-primary truncate">{t.label || t.name}</span>
                  <span className="rounded bg-surface-muted px-1.5 py-0.5 font-caption text-[10px] text-fg-muted">{t.kind.kind}</span>
                  <span className="rounded bg-surface-muted px-1.5 py-0.5 font-caption text-[10px] text-fg-muted">{t.tier}</span>
                </div>
                <div className="font-caption text-[10px] text-fg-muted truncate">{t.name}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => toggleEnabled(t)}
                  className={`rounded px-1.5 py-0.5 font-caption text-[10px] ${t.enabled ? "bg-success/15 text-success" : "bg-surface-muted text-fg-muted"}`}
                >
                  {t.enabled ? "启用" : "禁用"}
                </button>
                <button onClick={() => setEditing(t)} className="p-1 rounded text-fg-muted hover:bg-surface-secondary hover:text-fg-primary" title="编辑">
                  <Pencil size={12} />
                </button>
                <button onClick={() => remove(t)} className="p-1 rounded text-fg-muted hover:bg-error/15 hover:text-error" title="删除">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
            {t.description && <p className="mt-1 font-caption text-[10px] text-fg-secondary line-clamp-2">{t.description}</p>}
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <CustomToolEditorModal
          initial={editing}
          novelId={novelId}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={(saved) => {
            setTools((arr) => {
              const idx = arr.findIndex((x) => x.id === saved.id);
              return idx >= 0 ? arr.map((x) => (x.id === saved.id ? saved : x)) : [...arr, saved];
            });
          }}
        />
      )}
    </div>
  );
}
