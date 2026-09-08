import { useState, useCallback } from "react";
import { Loader2, Plug, Bot, MessageSquare, Database, Workflow, Info } from "lucide-react";
import { useUIStore, type SettingsTab } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { settingsApi } from "@/api/settings";
import { ProviderSection } from "./ProviderSection";
import { AgentModelSection } from "./AgentModelSection";
import { PipelineSection } from "./PipelineSection";

type TabKey = SettingsTab;

const TABS: { key: TabKey; label: string; icon: typeof Plug }[] = [
  { key: "providers", label: "模型提供商", icon: Plug },
  { key: "agents", label: "模型", icon: Bot },
  { key: "assistant", label: "对话助手", icon: MessageSquare },
  { key: "knowledge", label: "知识库", icon: Database },
  { key: "pipeline", label: "流程控制", icon: Workflow },
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
        systemModel: settingsStore.systemModel,
        embeddingProvider: settingsStore.embeddingProvider,
        embeddingModelDir: settingsStore.embeddingModelDir,
        embeddingApiKey: settingsStore.embeddingApiKey,
        agentMaxTurns: settingsStore.agentMaxTurns,
        reviewFixRounds: settingsStore.reviewFixRounds,
        reviewPassGrade: settingsStore.reviewPolicy.passGrade,
        reviewSevereHardFail: settingsStore.reviewPolicy.severeHardFail,
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
              className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 font-caption text-xs font-medium text-accent-ink transition-colors hover:bg-accent-light disabled:opacity-60"
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
            {tab === "pipeline" && <PipelineSection />}
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

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-1 font-heading text-base font-semibold text-fg-primary">对话助手</h3>
        <p className="font-body text-sm text-fg-secondary">
          AI 助手的人格设定（对话模型配置已移至「模型」tab，顶部「保存」生效）
        </p>
      </div>

      {/* 人格设定 */}
      <div>
        <p className="mb-1.5 font-body text-sm font-medium text-fg-primary">人格设定</p>
        <textarea
          value={chatPersona}
          onChange={(e) => setChatPersona(e.target.value)}
          rows={12}
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
  const embeddingModelDir = useSettingsStore((s) => s.embeddingModelDir);
  const setEmbeddingModelDir = useSettingsStore((s) => s.setEmbeddingModelDir);
  const embeddingApiKey = useSettingsStore((s) => s.embeddingApiKey);
  const setEmbeddingApiKey = useSettingsStore((s) => s.setEmbeddingApiKey);
  const options: { key: "glm" | "bge-m3"; label: string; desc: string }[] = [
    { key: "glm", label: "智谱 GLM embedding-2", desc: "云端 API，1024 维，质量较好" },
    { key: "bge-m3", label: "本地 bge-m3", desc: "本地推理，1024 维，无需 Key（首次加载约 2.2GB）" },
  ];
  const inputCls =
    "w-full rounded-md border border-subtle bg-surface-card px-3 py-2 font-body text-sm text-fg-primary placeholder:text-fg-muted focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20";
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
            <div className="flex-1">
              <p className="font-body text-sm font-medium text-fg-primary">{o.label}</p>
              <p className="font-caption text-xs text-fg-muted">{o.desc}</p>
            </div>
          </label>
        ))}
      </div>

      {embeddingProvider === "glm" && (
        <div>
          <p className="mb-1.5 font-body text-sm font-medium text-fg-primary">GLM Embedding API Key</p>
          <input
            type="password"
            value={embeddingApiKey}
            onChange={(e) => setEmbeddingApiKey(e.target.value)}
            placeholder="留空则复用「模型提供商」里的 GLM Key"
            className={inputCls}
          />
          <p className="mt-1 font-caption text-xs text-fg-muted">
            为 embedding 单独配一个 Key（可与对话/写作 Key 分开计费）。
          </p>
        </div>
      )}

      {embeddingProvider === "bge-m3" && (
        <div>
          <p className="mb-1.5 font-body text-sm font-medium text-fg-primary">本地模型目录（可选）</p>
          <input
            type="text"
            value={embeddingModelDir}
            onChange={(e) => setEmbeddingModelDir(e.target.value)}
            placeholder="留空则远程下载 Xenova/bge-m3；填本地目录则从目录加载"
            className={inputCls}
          />
          <p className="mt-1 font-caption text-xs text-fg-muted">
            填包含模型文件（model.onnx 等）的目录绝对路径，用于离线或自定义模型。
          </p>
        </div>
      )}
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
