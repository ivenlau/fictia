import { useCallback, useState, type ReactNode } from "react";
import { Bot, Cog, MessageSquare } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { AGENT_TYPE_LABELS } from "@fictia/shared";
import type { AgentType } from "@fictia/shared";
import { ModelSelector, modelSelectCls as selectCls } from "@/components/common/ModelSelector";

const allAgentTypes: AgentType[] = [
  "genre-analyst",
  "architect",
  "style-designer",
  "art-director",
  "narrative-weaver",
  "world-builder",
  "character-designer",
  "story-designer",
  "chapter-writer",
  "editor",
  "consistency-checker",
];

function Group({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: typeof Bot;
  title: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-1 flex items-center gap-2">
        <Icon size={14} className="text-accent" />
        <h4 className="font-body text-sm font-semibold text-fg-primary">{title}</h4>
      </div>
      <p className="mb-2 font-caption text-xs text-fg-muted">{desc}</p>
      {children}
    </section>
  );
}

/**
 * 模型配置面板（三组）：
 * - 助手：对话助手模型（chatModel）
 * - 系统：后台 LLM 任务（参考作品解析、章节摘要）模型（systemModel）
 * - 写作：流水线 11 个 agent 模型（agentModels）+ 一键统一
 */
export function AgentModelSection() {
  const agentModels = useSettingsStore((s) => s.agentModels);
  const setAgentModel = useSettingsStore((s) => s.setAgentModel);
  const chatModel = useSettingsStore((s) => s.chatModel);
  const setChatModel = useSettingsStore((s) => s.setChatModel);
  const systemModel = useSettingsStore((s) => s.systemModel);
  const setSystemModel = useSettingsStore((s) => s.setSystemModel);
  const providers = useSettingsStore((s) => s.providers);

  const usable = providers.filter((p) => p.enabled && p.models.some((m) => m.enabled));

  const pickFirstModel = (providerId: string) =>
    providers.find((p) => p.id === providerId)?.models.find((m) => m.enabled)?.id ?? "";

  const handleAgentProvider = useCallback(
    (agentType: AgentType, providerId: string) => setAgentModel(agentType, providerId, pickFirstModel(providerId)),
    [providers, setAgentModel],
  );
  const handleChatProvider = (providerId: string) => setChatModel(providerId, pickFirstModel(providerId));
  const handleSystemProvider = (providerId: string) => setSystemModel(providerId, pickFirstModel(providerId));

  // 一键统一写作模型
  const [uniformProvider, setUniformProvider] = useState<string>(usable[0]?.id ?? "");
  const uniformModels =
    providers.find((p) => p.id === uniformProvider)?.models.filter((m) => m.enabled) ?? [];
  const [uniformModel, setUniformModel] = useState<string>(uniformModels[0]?.id ?? "");
  const applyUniform = () => {
    if (!uniformProvider || !uniformModel) return;
    for (const t of allAgentTypes) setAgentModel(t, uniformProvider, uniformModel);
  };

  if (usable.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="mb-1 font-heading text-base font-semibold text-fg-primary">模型</h3>
          <p className="font-body text-sm text-fg-secondary">
            尚无可用的 provider。请先到「模型提供商」配置 API Key 并启用模型。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-1 font-heading text-base font-semibold text-fg-primary">模型</h3>
        <p className="font-body text-sm text-fg-secondary">
          三组模型配置（顶部「保存」生效）：写作（流水线 agent）/ 助手（对话）/ 系统（后台任务）
        </p>
      </div>

      {/* 助手组 */}
      <Group icon={MessageSquare} title="助手" desc="对话助手使用的模型。">
        <ModelSelector
          value={chatModel}
          providers={providers}
          usable={usable}
          onChangeProvider={handleChatProvider}
          onChangeModel={(m) => setChatModel(chatModel.providerId, m)}
        />
      </Group>

      {/* 系统组 */}
      <Group
        icon={Cog}
        title="系统"
        desc="后台 LLM 任务：参考作品解析、章节摘要。不直接产出正文，可用独立模型控制成本与质量。"
      >
        <ModelSelector
          value={systemModel}
          providers={providers}
          usable={usable}
          onChangeProvider={handleSystemProvider}
          onChangeModel={(m) => setSystemModel(systemModel.providerId, m)}
        />
      </Group>

      {/* 写作组 */}
      <Group
        icon={Bot}
        title="写作"
        desc="写作流水线各 agent 的模型（体裁分析 → 架构 → … → 章节写作 → 编辑）。"
      >
        <div className="mb-3 max-w-md rounded-lg border border-subtle bg-surface-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-caption text-xs font-medium text-fg-secondary">一键统一写作模型</span>
            <button
              onClick={applyUniform}
              disabled={!uniformModel}
              className="rounded-md bg-accent px-2.5 py-1 font-caption text-[11px] font-medium text-white transition-colors hover:bg-accent-deep disabled:opacity-40"
            >
              应用到全部
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={uniformProvider}
              onChange={(e) => {
                setUniformProvider(e.target.value);
                setUniformModel(pickFirstModel(e.target.value));
              }}
              className={selectCls}
            >
              {usable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select value={uniformModel} onChange={(e) => setUniformModel(e.target.value)} className={selectCls}>
              {uniformModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {allAgentTypes.map((agentType) => {
            const assignment = agentModels[agentType] ?? { providerId: "", modelId: "" };
            const provider = providers.find((p) => p.id === assignment.providerId);
            const models = provider?.models.filter((m) => m.enabled) ?? [];
            const providerDisabled =
              !!assignment.providerId && !usable.some((p) => p.id === assignment.providerId);
            return (
              <div key={agentType} className="rounded-lg border border-subtle bg-surface-card p-3">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-bg text-accent">
                    <Bot size={12} />
                  </div>
                  <span className="font-body text-xs font-medium text-fg-primary">
                    {AGENT_TYPE_LABELS[agentType]}
                  </span>
                </div>
                <div className="space-y-2">
                  <select
                    value={assignment.providerId}
                    onChange={(e) => handleAgentProvider(agentType, e.target.value)}
                    className={selectCls}
                  >
                    {usable.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                    {providerDisabled && (
                      <option value={assignment.providerId}>
                        {provider?.name ?? assignment.providerId}（已停用）
                      </option>
                    )}
                  </select>
                  <select
                    value={assignment.modelId}
                    onChange={(e) => setAgentModel(agentType, assignment.providerId, e.target.value)}
                    className={selectCls}
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                    {assignment.modelId && !models.some((m) => m.id === assignment.modelId) && (
                      <option value={assignment.modelId}>{assignment.modelId}（已停用）</option>
                    )}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      </Group>
    </div>
  );
}
