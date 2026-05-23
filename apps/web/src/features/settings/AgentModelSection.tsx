import { useCallback } from "react";
import { Bot } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  AGENT_TYPE_LABELS,
  PROVIDER_LABELS,
  DEFAULT_MODELS,
  DEFAULT_AGENT_MODELS,
} from "@fictia/shared";
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

  const handleProviderChange = useCallback(
    (agentType: AgentType, provider: string) => {
      const firstModel = DEFAULT_MODELS[provider]?.[0] ?? "";
      setAgentModel(agentType, provider, firstModel);
    },
    [setAgentModel],
  );

  const handleModelChange = useCallback(
    (agentType: AgentType, model: string) => {
      const current = agentModels[agentType] ?? DEFAULT_AGENT_MODELS[agentType];
      setAgentModel(agentType, current.provider, model);
    },
    [agentModels, setAgentModel],
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-heading text-base font-semibold text-fg-primary mb-1">
          Agent 模型
        </h3>
        <p className="font-body text-sm text-fg-secondary">
          为每种 Agent 类型分配不同的模型
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {allAgentTypes.map((agentType) => {
          const assignment = agentModels[agentType] ?? DEFAULT_AGENT_MODELS[agentType];
          const availableModels = DEFAULT_MODELS[assignment.provider] ?? [];

          return (
            <div
              key={agentType}
              className="rounded-lg border border-subtle bg-surface-card p-3.5"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-bg text-accent">
                  <Bot size={14} />
                </div>
                <span className="font-body text-sm font-medium text-fg-primary">
                  {AGENT_TYPE_LABELS[agentType]}
                </span>
              </div>

              <div className="space-y-2">
                <select
                  value={assignment.provider}
                  onChange={(e) =>
                    handleProviderChange(agentType, e.target.value)
                  }
                  className="w-full rounded-md border border-subtle bg-surface-muted px-2.5 py-1.5 font-caption text-xs text-fg-primary focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                >
                  {Object.entries(PROVIDER_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>

                <select
                  value={assignment.model}
                  onChange={(e) =>
                    handleModelChange(agentType, e.target.value)
                  }
                  className="w-full rounded-md border border-subtle bg-surface-muted px-2.5 py-1.5 font-caption text-xs text-fg-primary focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                >
                  {availableModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
