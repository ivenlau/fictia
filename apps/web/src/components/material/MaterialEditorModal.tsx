import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ModalOverlay } from "@/components/layout/ModalOverlay";
import { AiGenerateButton } from "@/components/ui/AiGenerateButton";
import {
  materialsApi,
  type UserMaterial,
  type UserMaterialType,
} from "@/api/materials";

interface MaterialEditorModalProps {
  novelId: string;
  type: UserMaterialType;
  /** 编辑现有素材；null=新建。 */
  initial: UserMaterial | null;
  onClose: () => void;
  onSaved: () => void;
}

const TYPE_LABEL: Record<UserMaterialType, string> = {
  craft: "写作技法",
  "genre-card": "体裁卡",
  "prompt-snippet": "提示词片段",
};

/** 创建/编辑用户素材（自定义技法 / 自定义体裁卡）。 */
export function MaterialEditorModal({
  novelId,
  type,
  initial,
  onClose,
  onSaved,
}: MaterialEditorModalProps) {
  const isCreate = !initial;
  const [key, setKey] = useState(initial?.key ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [agents, setAgents] = useState((initial?.agents ?? []).join(", "));
  const [content, setContent] = useState(initial?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validKey = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(key);

  const save = async () => {
    setError(null);
    if (isCreate && !validKey) {
      setError("key 只能含字母数字、下划线、连字符，且不以连字符开头");
      return;
    }
    setSaving(true);
    try {
      const agentsList = agents
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const data = {
        name: name.trim() || key,
        description: description.trim(),
        enabled,
        content,
        ...(type === "craft" && agentsList.length ? { agents: agentsList } : {}),
      };
      if (isCreate) {
        await materialsApi.createUserMaterial(novelId, type, key, data);
      } else {
        await materialsApi.updateUserMaterial(novelId, type, key, data);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-surface-card border border-subtle rounded-lg w-[640px] max-w-[92vw] max-h-[88vh] flex flex-col">
        <div className="px-5 pt-4 pb-3 border-b border-subtle">
          <h2 className="font-heading text-base font-semibold text-fg-primary">
            {isCreate ? `新建自定义${TYPE_LABEL[type]}` : `编辑${TYPE_LABEL[type]}`}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {isCreate && (
            <Field label="key（文件名/引用标识，创建后不可改）">
              <input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="如 my-style"
                className="font-caption text-xs bg-surface-secondary border border-subtle rounded-md px-2 py-1.5 text-fg-primary focus:outline-none focus:border-accent w-full"
              />
            </Field>
          )}
          <Field label="名称">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="显示名"
              className="font-body text-xs bg-surface-secondary border border-subtle rounded-md px-2 py-1.5 text-fg-primary focus:outline-none focus:border-accent w-full"
            />
          </Field>
          <Field label="描述（可选）">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="一句话说明"
              className="font-body text-xs bg-surface-secondary border border-subtle rounded-md px-2 py-1.5 text-fg-primary focus:outline-none focus:border-accent w-full"
            />
          </Field>
          {type === "craft" && (
            <Field label="限定 agent（可选，逗号分隔；留空=所有加载技法的 agent）">
              <input
                value={agents}
                onChange={(e) => setAgents(e.target.value)}
                placeholder="如 chapter-writer, editor"
                className="font-caption text-xs bg-surface-secondary border border-subtle rounded-md px-2 py-1.5 text-fg-primary focus:outline-none focus:border-accent w-full"
              />
            </Field>
          )}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="font-caption text-[10px] uppercase tracking-wider text-fg-muted">
                正文（Markdown）
              </label>
              <AiGenerateButton
                kind={type}
                fields={{
                  name,
                  description,
                  ...(type === "craft" && agents.trim() ? { agents } : {}),
                }}
                current={content}
                onResult={setContent}
                disabled={!name.trim() && !description.trim()}
              />
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
              placeholder={
                type === "craft"
                  ? "写作技法正文……"
                  : type === "genre-card"
                    ? "体裁卡正文（开场抓手 / 冲突发动机 / 爽点 / ……）"
                    : "提示词片段正文（点击「插入」时会追加到输入框）"
              }
              className="font-body text-xs leading-relaxed bg-surface-secondary border border-subtle rounded-md px-2 py-1.5 text-fg-primary focus:outline-none focus:border-accent w-full resize-y"
            />
          </div>
          {type !== "prompt-snippet" && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="accent-accent"
              />
              <span className="font-body text-xs text-fg-secondary">启用（注入到 agent）</span>
            </label>
          )}
          {error && <p className="font-body text-xs text-error">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-subtle flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="font-body text-xs px-3 py-1.5 rounded-md text-fg-secondary hover:bg-surface-secondary transition-colors"
          >
            取消
          </button>
          <button
            onClick={save}
            disabled={saving || (isCreate && !validKey)}
            className="font-body text-xs px-3 py-1.5 rounded-md bg-accent text-white disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center gap-1.5"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            保存
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="font-caption text-[10px] uppercase tracking-wider text-fg-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
