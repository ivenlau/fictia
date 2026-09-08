import { useState, useCallback } from "react";
import {
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  Settings2,
} from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { providersApi } from "@/api/providers";
import { parseTokenNumber, formatTokenNumber } from "@/lib/tokens";
import type { ProviderInfo } from "@fictia/shared";

export function ProviderSection() {
  const providers = useSettingsStore((s) => s.providers);
  const upsertProvider = useSettingsStore((s) => s.upsertProvider);
  const removeProvider = useSettingsStore((s) => s.removeProvider);
  const [adding, setAdding] = useState(false);

  const preset = providers.filter((p) => p.type === "preset");
  const custom = providers.filter((p) => p.type === "custom");

  const handleSaved = useCallback((p: ProviderInfo) => upsertProvider(p), [upsertProvider]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-heading text-base font-semibold text-fg-primary mb-1">模型提供商</h3>
        <p className="font-body text-sm text-fg-secondary">
          为预置厂商填入 API Key 即可使用；也可添加自定义 provider / 模型。模型更新后可自行维护。
        </p>
      </div>

      <div>
        <p className="mb-2 font-caption text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
          预置提供商
        </p>
        <div className="space-y-2">
          {preset.map((p) => (
            <ProviderCard key={p.id} provider={p} onSaved={handleSaved} onRemoved={removeProvider} />
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="font-caption text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
            自定义提供商
          </p>
          <button
            onClick={() => setAdding((v) => !v)}
            className="flex items-center gap-1 rounded-md border border-subtle bg-surface-card px-2.5 py-1 font-caption text-xs text-fg-secondary transition-colors hover:bg-surface-secondary"
          >
            <Plus size={12} /> 添加
          </button>
        </div>
        {adding && (
          <CustomProviderForm
            onCreated={(p) => {
              upsertProvider(p);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        )}
        <div className="mt-2 space-y-2">
          {custom.map((p) => (
            <ProviderCard key={p.id} provider={p} onSaved={handleSaved} onRemoved={removeProvider} />
          ))}
          {custom.length === 0 && !adding && (
            <p className="py-2 font-body text-xs text-fg-muted">暂无自定义提供商</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ProviderCard({
  provider,
  onSaved,
  onRemoved,
}: {
  provider: ProviderInfo;
  onSaved: (p: ProviderInfo) => void;
  onRemoved: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "ok" | "fail">("idle");
  const [testError, setTestError] = useState("");
  const [addingModel, setAddingModel] = useState(false);
  const [newModelId, setNewModelId] = useState("");
  const [newModelName, setNewModelName] = useState("");
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [editCtx, setEditCtx] = useState("");
  const [editMax, setEditMax] = useState("");
  const [editReasoning, setEditReasoning] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  const isCustom = provider.type === "custom";
  const hasKey = !!provider.apiKey;

  const saveKey = async () => {
    if (!keyInput || keyInput.startsWith("****")) return;
    setSavingKey(true);
    try {
      const updated = await providersApi.update(provider.id, { apiKey: keyInput });
      onSaved(updated);
      setKeyInput("");
    } finally {
      setSavingKey(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult("idle");
    try {
      const res = await providersApi.test(provider.id, keyInput || undefined);
      setTestResult(res.ok ? "ok" : "fail");
      setTestError(res.error ?? "");
    } catch (e: any) {
      setTestResult("fail");
      setTestError(e?.message ?? "连接失败");
    } finally {
      setTesting(false);
    }
  };

  const toggleEnabled = async () => {
    const updated = await providersApi.update(provider.id, { enabled: !provider.enabled });
    onSaved(updated);
  };

  const toggleModel = async (modelId: string, enabled: boolean) => {
    const m = await providersApi.updateModel(provider.id, modelId, { enabled: !enabled });
    onSaved({ ...provider, models: provider.models.map((x) => (x.id === modelId ? m : x)) });
  };

  const removeModel = async (modelId: string) => {
    await providersApi.removeModel(provider.id, modelId);
    const model = provider.models.find((m) => m.id === modelId);
    onSaved({
      ...provider,
      models:
        model?.type === "custom"
          ? provider.models.filter((m) => m.id !== modelId)
          : provider.models.map((m) => (m.id === modelId ? { ...m, enabled: false } : m)),
    });
  };

  const addModel = async () => {
    if (!newModelName.trim()) return;
    const m = await providersApi.addModel(provider.id, {
      id: newModelId.trim() || undefined,
      name: newModelName.trim(),
    });
    onSaved({ ...provider, models: [...provider.models, m] });
    setNewModelId("");
    setNewModelName("");
    setAddingModel(false);
  };

  const startEditModel = (m: { id: string; contextWindow: number; maxTokens: number; reasoning: boolean }) => {
    setEditingModelId(m.id);
    setEditCtx(formatTokenNumber(m.contextWindow));
    setEditMax(formatTokenNumber(m.maxTokens));
    setEditReasoning(!!m.reasoning);
    setEditError("");
  };

  const saveEditModel = async (modelId: string) => {
    const ctx = parseTokenNumber(editCtx);
    const max = parseTokenNumber(editMax);
    if (ctx == null || max == null) {
      setEditError("请填有效数字，如 200k / 20k / 1024");
      return;
    }
    setSavingEdit(true);
    try {
      const m = await providersApi.updateModel(provider.id, modelId, {
        contextWindow: ctx,
        maxTokens: max,
        reasoning: editReasoning,
      });
      onSaved({ ...provider, models: provider.models.map((mm) => (mm.id === modelId ? m : mm)) });
      setEditingModelId(null);
    } catch (e: any) {
      setEditError(e?.message ?? "保存失败");
    } finally {
      setSavingEdit(false);
    }
  };

  const resetModels = async () => {
    const updated = await providersApi.resetModels(provider.id);
    onSaved(updated);
  };

  const deleteProvider = async () => {
    await providersApi.remove(provider.id);
    onRemoved(provider.id);
  };

  return (
    <div className="rounded-lg border border-subtle bg-surface-card">
      {/* header (collapsible) */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-muted/40"
      >
        {expanded ? <ChevronDown size={14} className="text-fg-muted" /> : <ChevronRight size={14} className="text-fg-muted" />}
        <span className="flex-1 font-body text-sm font-medium text-fg-primary">{provider.name}</span>
        {hasKey ? (
          <span className="flex items-center gap-1 font-caption text-[11px] text-success">
            <CheckCircle2 size={11} /> 已配置
          </span>
        ) : (
          <span className="font-caption text-[11px] text-fg-muted">未配置 Key</span>
        )}
        <span
          onClick={(e) => {
            e.stopPropagation();
            toggleEnabled();
          }}
          className={`ml-1 rounded px-1.5 py-0.5 font-caption text-[10px] ${
            provider.enabled ? "bg-accent-bg text-accent" : "bg-surface-muted text-fg-muted"
          }`}
        >
          {provider.enabled ? "启用" : "停用"}
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-subtle px-3 py-3">
          {/* api key */}
          <div>
            <label className="mb-1 block font-caption text-[11px] text-fg-muted">API Key</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? "text" : "password"}
                  value={keyInput}
                  onChange={(e) => {
                    setKeyInput(e.target.value);
                    setTestResult("idle");
                  }}
                  placeholder={hasKey ? `已配置（${provider.apiKey}），输入新值覆盖` : "输入 API Key..."}
                  className="w-full rounded-md border border-subtle bg-surface-muted px-3 py-1.5 pr-9 font-caption text-xs text-fg-primary placeholder:text-fg-muted focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20"
                />
                <button
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-muted transition-colors hover:text-fg-primary"
                >
                  {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <button
                onClick={saveKey}
                disabled={!keyInput || savingKey}
                className="rounded-md border border-subtle bg-surface-card px-3 py-1.5 font-caption text-xs text-fg-secondary transition-colors hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingKey ? <Loader2 size={12} className="animate-spin" /> : "保存"}
              </button>
              <button
                onClick={test}
                disabled={testing}
                className="flex items-center gap-1 rounded-md border border-subtle bg-surface-card px-3 py-1.5 font-caption text-xs text-fg-secondary transition-colors hover:bg-surface-secondary disabled:opacity-50"
              >
                {testing ? <Loader2 size={12} className="animate-spin" /> : "测试"}
              </button>
            </div>
            {testResult === "ok" && (
              <p className="mt-1 flex items-center gap-1 font-caption text-[11px] text-success">
                <CheckCircle2 size={11} /> 连接正常
              </p>
            )}
            {testResult === "fail" && (
              <p className="mt-1 flex items-center gap-1 font-caption text-[11px] text-error">
                <XCircle size={11} /> {testError || "连接失败"}
              </p>
            )}
          </div>

          {/* base url (read-only for preset, editable for custom) */}
          <div>
            <label className="mb-1 block font-caption text-[11px] text-fg-muted">Base URL</label>
            <input
              value={provider.baseUrl}
              readOnly={!isCustom}
              onChange={(e) => onSaved({ ...provider, baseUrl: e.target.value })}
              className={`w-full rounded-md border border-subtle bg-surface-muted px-3 py-1.5 font-caption text-xs text-fg-primary focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20 ${
                isCustom ? "" : "cursor-default opacity-70"
              }`}
            />
            {isCustom && (
              <button
                onClick={async () => {
                  const updated = await providersApi.update(provider.id, { baseUrl: provider.baseUrl });
                  onSaved(updated);
                }}
                className="mt-1 font-caption text-[11px] text-accent hover:underline"
              >
                保存 Base URL
              </button>
            )}
          </div>

          {/* models */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="font-caption text-[11px] text-fg-muted">模型（{provider.models.length}）</label>
              <button
                onClick={() => setAddingModel((v) => !v)}
                className="flex items-center gap-1 font-caption text-[11px] text-accent hover:underline"
              >
                <Plus size={11} /> 添加模型
              </button>
            </div>
            {addingModel && (
              <div className="mb-2 flex gap-2 rounded-md border border-subtle bg-surface-muted/40 p-2">
                <input
                  value={newModelId}
                  onChange={(e) => setNewModelId(e.target.value)}
                  placeholder="模型 id（如 glm-5.1）"
                  className="w-1/3 rounded border border-subtle bg-surface-card px-2 py-1 font-caption text-[11px] focus:border-accent/40 focus:outline-none"
                />
                <input
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  placeholder="显示名（如 GLM-5.1）"
                  className="flex-1 rounded border border-subtle bg-surface-card px-2 py-1 font-caption text-[11px] focus:border-accent/40 focus:outline-none"
                />
                <button
                  onClick={addModel}
                  className="rounded bg-accent px-2 py-1 font-caption text-[11px] text-accent-ink hover:bg-accent-light"
                >
                  添加
                </button>
              </div>
            )}
            <div className="space-y-1">
              {provider.models.map((m) => (
                <div key={m.id}>
                  <div className="flex items-center gap-2 rounded px-2 py-1 hover:bg-surface-muted/40">
                    <button
                      onClick={() => toggleModel(m.id, m.enabled)}
                      className={`h-3.5 w-3.5 shrink-0 rounded-full border ${
                        m.enabled ? "border-accent bg-accent" : "border-fg-muted bg-surface-card"
                      }`}
                      title={m.enabled ? "已启用" : "已停用"}
                    />
                    <span className="flex-1 truncate font-caption text-xs text-fg-primary">{m.name}</span>
                    <span className="font-caption text-[10px] text-fg-muted">{m.id}</span>
                    <span className="font-caption text-[10px] text-fg-muted" title="上下文窗口 / 最大输出">
                      {formatTokenNumber(m.contextWindow)}/{formatTokenNumber(m.maxTokens)}
                    </span>
                    {m.reasoning && (
                      <span className="rounded bg-surface-muted px-1 font-caption text-[10px] text-fg-secondary">推理</span>
                    )}
                    <button
                      onClick={() => startEditModel(m)}
                      className="text-fg-muted transition-colors hover:text-accent"
                      title="编辑参数（上下文窗口/最大输出/推理）"
                    >
                      <Settings2 size={12} />
                    </button>
                    <button
                      onClick={() => removeModel(m.id)}
                      className="text-fg-muted transition-colors hover:text-error"
                      title={m.type === "custom" ? "删除" : "停用"}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {editingModelId === m.id && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 rounded-md border border-subtle bg-surface-muted/40 px-2 py-2">
                      <label className="font-caption text-[10px] text-fg-muted">上下文窗口</label>
                      <input
                        value={editCtx}
                        onChange={(e) => setEditCtx(e.target.value)}
                        placeholder="如 200k / 1m / 128000"
                        className="w-24 rounded border border-subtle bg-surface-card px-2 py-1 font-caption text-[11px] focus:border-accent/40 focus:outline-none"
                      />
                      <label className="font-caption text-[10px] text-fg-muted">最大输出</label>
                      <input
                        value={editMax}
                        onChange={(e) => setEditMax(e.target.value)}
                        placeholder="如 20k / 8192"
                        className="w-20 rounded border border-subtle bg-surface-card px-2 py-1 font-caption text-[11px] focus:border-accent/40 focus:outline-none"
                      />
                      <label className="flex items-center gap-1 font-caption text-[10px] text-fg-muted">
                        <input
                          type="checkbox"
                          checked={editReasoning}
                          onChange={(e) => setEditReasoning(e.target.checked)}
                          className="h-3 w-3"
                        />
                        推理
                      </label>
                      <button
                        onClick={() => saveEditModel(m.id)}
                        disabled={savingEdit}
                        className="flex items-center gap-1 rounded bg-accent px-2 py-1 font-caption text-[11px] text-accent-ink hover:bg-accent-light disabled:opacity-50"
                      >
                        {savingEdit ? <Loader2 size={11} className="animate-spin" /> : null}
                        保存
                      </button>
                      <button
                        onClick={() => setEditingModelId(null)}
                        className="rounded border border-subtle px-2 py-1 font-caption text-[11px] text-fg-secondary hover:bg-surface-card"
                      >
                        取消
                      </button>
                      {editError && (
                        <span className="font-caption text-[10px] text-error">{editError}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {provider.models.length === 0 && (
                <p className="px-2 py-1 font-caption text-[11px] text-fg-muted">暂无模型</p>
              )}
            </div>
          </div>

          {/* footer actions */}
          <div className="flex items-center justify-between border-t border-subtle pt-2">
            {!isCustom ? (
              <button
                onClick={resetModels}
                className="flex items-center gap-1 font-caption text-[11px] text-fg-secondary hover:text-fg-primary"
              >
                <RotateCcw size={11} /> 恢复预置模型
              </button>
            ) : (
              <span />
            )}
            {isCustom && (
              <button
                onClick={deleteProvider}
                className="flex items-center gap-1 font-caption text-[11px] text-error hover:underline"
              >
                <Trash2 size={11} /> 删除提供商
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CustomProviderForm({
  onCreated,
  onCancel,
}: {
  onCreated: (p: ProviderInfo) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!name.trim() || !baseUrl.trim()) {
      setError("名称和 Base URL 必填");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const p = await providersApi.create({ name: name.trim(), baseUrl: baseUrl.trim(), apiKey: apiKey.trim() });
      onCreated(p);
    } catch (e: any) {
      setError(e?.message ?? "创建失败");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mb-2 space-y-2 rounded-lg border border-subtle bg-surface-card p-3">
      <div className="grid grid-cols-2 gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="名称（如 My OpenAI Proxy）"
          className="rounded-md border border-subtle bg-surface-muted px-2.5 py-1.5 font-caption text-xs focus:border-accent/40 focus:outline-none"
        />
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="Base URL（如 https://api.example.com/v1）"
          className="rounded-md border border-subtle bg-surface-muted px-2.5 py-1.5 font-caption text-xs focus:border-accent/40 focus:outline-none"
        />
      </div>
      <input
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="API Key（可选，稍后也可填）"
        className="w-full rounded-md border border-subtle bg-surface-muted px-2.5 py-1.5 font-caption text-xs focus:border-accent/40 focus:outline-none"
      />
      {error && <p className="font-caption text-[11px] text-error">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded px-2.5 py-1 font-caption text-xs text-fg-muted hover:text-fg-primary">
          取消
        </button>
        <button
          onClick={submit}
          disabled={creating}
          className="rounded bg-accent px-3 py-1 font-caption text-xs text-accent-ink hover:bg-accent-light disabled:opacity-50"
        >
          {creating ? "创建中..." : "创建"}
        </button>
      </div>
    </div>
  );
}
