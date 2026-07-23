import { useCallback } from "react";
import { Bot } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { AGENT_TYPE_LABELS } from "@fictia/shared";
import type { AgentType } from "@fictia/shared";

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

export function AgentModelSection() {
  const agentModels = useSettingsStore((s) => s.agentModels);
  const setAgentModel = useSettingsStore((s) => s.setAgentModel);
  const providers = useSettingsStore((s) => s.providers);

  // usable providers (enabled + has at least one enabled model)
  const usable = providers.filter((p) => p.enabled && p.models.some((m) => m.enabled));

  const handleProviderChange = useCallback(
    (agentType: AgentType, providerId: string) => {
      const provider = providers.find((p) => p.id === providerId);
      const firstModel = provider?.models.find((m) => m.enabled)?.id ?? "";
      setAgentModel(agentType, providerId, firstModel);
    },
    [providers, setAgentModel],
  );

  if (usable.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="mb-1 font-heading text-base font-semibold text-fg-primary">Agent 模型分配</h3>
          <p className="font-body text-sm text-fg-secondary">
            尚无可用的 provider。请先到「模型提供商」配置 API Key 并启用模型。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-1 font-heading text-base font-semibold text-fg-primary">Agent 模型分配</h3>
        <p className="font-body text-sm text-fg-secondary">为每种 Agent 选择 provider 与模型（顶部「保存」生效）</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {allAgentTypes.map((agentType) => {
          const assignment = agentModels[agentType] ?? { providerId: "", modelId: "" };
          const provider = providers.find((p) => p.id === assignment.providerId);
          const models = provider?.models.filter((m) => m.enabled) ?? [];
          const providerDisabled = !!assignment.providerId && !usable.some((p) => p.id === assignment.providerId);

          return (
            <div key={agentType} className="rounded-lg border border-subtle bg-surface-card p-3.5">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-bg text-accent">
                  <Bot size={14} />
                </div>
                <span className="font-body text-sm font-medium text-fg-primary">
                  {AGENT_TYPE_LABELS[agentType]}
                </span>
              </div>

              <div className="space-y-2">
                <select
                  value={assignment.providerId}
                  onChange={(e) => handleProviderChange(agentType, e.target.value)}
                  className="w-full rounded-md border border-subtle bg-surface-muted px-2.5 py-1.5 font-caption text-xs text-fg-primary focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20"
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
                  className="w-full rounded-md border border-subtle bg-surface-muted px-2.5 py-1.5 font-caption text-xs text-fg-primary focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20"
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
    </div>
  );
}
