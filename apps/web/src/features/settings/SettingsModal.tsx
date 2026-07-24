import { useState, useCallback } from "react";
import { Loader2, Plug, Bot, MessageSquare, Database, Info } from "lucide-react";
import { useUIStore, type SettingsTab } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { settingsApi } from "@/api/settings";
import { ProviderSection } from "./ProviderSection";
import { AgentModelSection } from "./AgentModelSection";

type TabKey = SettingsTab;

const TABS: { key: TabKey; label: string; icon: typeof Plug }[] = [
  { key: "providers", label: "模型提供商", icon: Plug },
  { key: "agents", label: "Agent 模型", icon: Bot },
  { key: "assistant", label: "对话助手", icon: MessageSquare },
  { key: "knowledge", label: "知识库", icon: Database },
  { key: "about", label: "关于", icon: Info },
];

export function SettingsModal() {
  const setShowSettings = useUIStore((s) => s.setShowSettings);
  const initialTab = useUIStore((s) => s.settingsInitialTab);
  const settingsStore = useSettingsStore();
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      await settingsApi.update({
        agentModels: settingsStore.agentModels,
        chatPersona: settingsStore.chatPersona,
        chatModel: settingsStore.chatModel,
        embeddingProvider: settingsStore.embeddingProvider,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }, [settingsStore]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={() => setShowSettings(false)}
    >
      <div
        className="relative flex h-[72vh] w-[1100px] max-w-[95vw] flex-col overflow-hidden rounded-xl border border-subtle bg-surface-primary shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-subtle px-5 py-3">
          <h2 className="font-heading text-base font-bold text-fg-primary">设置</h2>
          <div className="flex items-center gap-2">
            {saved && <span className="font-caption text-xs text-success">已保存</span>}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 font-caption text-xs font-medium text-white transition-colors hover:bg-accent-deep disabled:opacity-60"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              保存
            </button>
            <button
              onClick={() => setShowSettings(false)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-secondary hover:text-fg-primary"
              aria-label="关闭"
            >
              &times;
            </button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <nav className="w-44 shrink-0 border-r border-subtle bg-surface-muted/30 p-2">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left font-body text-sm transition-colors ${
                  tab === key
                    ? "bg-surface-card text-fg-primary shadow-sm"
                    : "text-fg-secondary hover:bg-surface-muted/60 hover:text-fg-primary"
                }`}
              >
                <Icon size={14} className={tab === key ? "text-accent" : "text-fg-muted"} />
                {label}
              </button>
            ))}
          </nav>

          <main className="flex-1 overflow-auto p-5">
            {tab === "providers" && <ProviderSection />}
            {tab === "agents" && <AgentModelSection />}
            {tab === "assistant" && <AssistantSection />}
            {tab === "knowledge" && <KnowledgeSection />}
            {tab === "about" && <AboutSection />}
          </main>
        </div>
      </div>
    </div>
  );
}

function AssistantSection() {
  const chatPersona = useSettingsStore((s) => s.chatPersona);
  const setChatPersona = useSettingsStore((s) => s.setChatPersona);
  const chatModel = useSettingsStore((s) => s.chatModel);
  const setChatModel = useSettingsStore((s) => s.setChatModel);
  const providers = useSettingsStore((s) => s.providers);

  // usable providers (enabled + has at least one enabled model)
  const usable = providers.filter((p) => p.enabled && p.models.some((m) => m.enabled));
  const provider = providers.find((p) => p.id === chatModel.providerId);
  const models = provider?.models.filter((m) => m.enabled) ?? [];
  const providerDisabled = !!chatModel.providerId && !usable.some((p) => p.id === chatModel.providerId);

  const handleProviderChange = (providerId: string) => {
    const p = providers.find((pr) => pr.id === providerId);
    const firstModel = p?.models.find((m) => m.enabled)?.id ?? "";
    setChatModel(providerId, firstModel);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-1 font-heading text-base font-semibold text-fg-primary">对话助手</h3>
        <p className="font-body text-sm text-fg-secondary">AI 助手的人格设定与对话模型（顶部「保存」生效）</p>
      </div>

      {/* 对话模型 */}
      <div className="rounded-lg border border-subtle bg-surface-card p-3.5 space-y-2">
        <p className="font-body text-sm font-medium text-fg-primary">对话模型</p>
        {usable.length === 0 ? (
          <p className="font-caption text-xs text-fg-muted">
            尚无可用模型，请先到「模型提供商」配置 API Key 并启用模型。
          </p>
        ) : (
          <>
            <select
              value={chatModel.providerId}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="w-full rounded-md border border-subtle bg-surface-muted px-2.5 py-1.5 font-caption text-xs text-fg-primary focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20"
            >
              {usable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {providerDisabled && (
                <option value={chatModel.providerId}>
                  {provider?.name ?? chatModel.providerId}（已停用）
                </option>
              )}
            </select>
            <select
              value={chatModel.modelId}
              onChange={(e) => setChatModel(chatModel.providerId, e.target.value)}
              className="w-full rounded-md border border-subtle bg-surface-muted px-2.5 py-1.5 font-caption text-xs text-fg-primary focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
              {chatModel.modelId && !models.some((m) => m.id === chatModel.modelId) && (
                <option value={chatModel.modelId}>{chatModel.modelId}（已停用）</option>
              )}
            </select>
          </>
        )}
      </div>

      {/* 人格设定 */}
      <div>
        <p className="mb-1.5 font-body text-sm font-medium text-fg-primary">人格设定</p>
        <textarea
          value={chatPersona}
          onChange={(e) => setChatPersona(e.target.value)}
          rows={10}
          placeholder="留空将使用默认人格"
          className="w-full resize-none rounded-md border border-subtle bg-surface-card px-3 py-2 font-body text-sm text-fg-primary placeholder:text-fg-muted focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20"
        />
      </div>
    </div>
  );
}

function KnowledgeSection() {
  const embeddingProvider = useSettingsStore((s) => s.embeddingProvider);
  const setEmbeddingProvider = useSettingsStore((s) => s.setEmbeddingProvider);
  const options: { key: "glm" | "bge-m3"; label: string; desc: string }[] = [
    { key: "glm", label: "智谱 GLM embedding-2", desc: "需配置 GLM API Key，质量较好" },
    { key: "bge-m3", label: "本地 bge-m3", desc: "无需 Key，本地推理，首次加载较慢" },
  ];
  return (
    <div className="space-y-3">
      <div>
        <h3 className="mb-1 font-heading text-base font-semibold text-fg-primary">知识库 Embedding</h3>
        <p className="font-body text-sm text-fg-secondary">向量检索使用的 embedding 提供商（切换后需重新索引）</p>
      </div>
      <div className="space-y-2">
        {options.map((o) => (
          <label
            key={o.key}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
              embeddingProvider === o.key
                ? "border-accent bg-accent-bg/40"
                : "border-subtle bg-surface-card hover:bg-surface-muted/40"
            }`}
          >
            <input
              type="radio"
              checked={embeddingProvider === o.key}
              onChange={() => setEmbeddingProvider(o.key)}
              className="mt-0.5"
            />
            <div>
              <p className="font-body text-sm font-medium text-fg-primary">{o.label}</p>
              <p className="font-caption text-xs text-fg-muted">{o.desc}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function AboutSection() {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="mb-1 font-heading text-base font-semibold text-fg-primary">关于 Fictia</h3>
      </div>
      <p className="font-body text-sm text-fg-secondary">AI 驱动的小说创作工作台。</p>
      <p className="font-caption text-xs text-fg-muted">所有 API Key 仅保存在本地数据库，不会上传。</p>
    </div>
  );
}
