import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { materialsApi } from "@/api/materials";

/**
 * C1 创作偏好（提示词 tab）：作者常驻指令，启用后注入所有 agent 的 system prompt
 * 顶部「# 用户偏好」段（优先级最高）。按书生效。
 */
export function PreferencesSection({ novelId }: { novelId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await materialsApi.getPreferences(novelId);
      setEnabled(p.enabled);
      setContent(p.content);
    } catch (err: any) {
      setError(err?.message ?? "加载失败");
    } finally {
      setLoading(false);
    }
  }, [novelId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await materialsApi.setPreferences(novelId, enabled, content);
      setSaved(true);
    } catch (err: any) {
      setError(err?.message ?? "保存失败");
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

  return (
    <div className="flex flex-col">
      <div className="px-3 py-2 border-b border-subtle">
        <p className="font-body text-xs font-medium text-fg-primary">创作偏好（常驻指令）</p>
        <p className="font-caption text-[10px] text-fg-muted mt-0.5">
          启用后注入所有 agent 提示词顶部「# 用户偏好」段，优先级最高。例：本卷走爽文节奏、多用短句。
        </p>
      </div>

      <div className="p-3 flex flex-col gap-2 flex-1">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              setSaved(false);
            }}
            className="accent-accent"
          />
          <span className="font-body text-xs text-fg-secondary">启用并注入</span>
        </label>

        <textarea
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setSaved(false);
          }}
          rows={10}
          placeholder={"例如：\n- 本卷走爽文节奏，避免后妈文\n- 多用短句，对话占比 30%+\n- 主角名字统一用全名"}
          className="font-body text-xs leading-relaxed bg-surface-secondary border border-subtle rounded-md px-2 py-1.5 text-fg-primary focus:outline-none focus:border-accent resize-y flex-1 min-h-[180px]"
        />

        {error && <p className="font-body text-xs text-error">{error}</p>}

        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 font-body text-xs px-3 py-1.5 rounded-md bg-accent text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            保存
          </button>
          {saved && (
            <span className="font-caption text-[10px] text-success">已保存</span>
          )}
        </div>
      </div>
    </div>
  );
}
