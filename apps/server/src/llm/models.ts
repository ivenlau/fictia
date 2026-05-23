import type { AgentType } from "@fictia/shared";
import { DEFAULT_AGENT_MODELS } from "@fictia/shared";
import { createModel } from "./providers.js";
import type { Model } from "@earendil-works/pi-ai";

export interface AgentModelConfig {
  model: Model<"openai-completions">;
  apiKey: string;
}

export function getModelForAgent(
  agentType: AgentType,
  apiKeys: Record<string, string>,
  agentModels?: Record<AgentType, { provider: string; model: string }>
): AgentModelConfig {
  const config = agentModels?.[agentType] ?? DEFAULT_AGENT_MODELS[agentType];
  const apiKeyMap: Record<string, string> = {
    glm: apiKeys.glm ?? "",
    minimax: apiKeys.minimax ?? "",
    doubao: apiKeys.doubao ?? "",
  };

  const apiKey = apiKeyMap[config.provider];
  if (!apiKey) {
    throw new Error(`API key not configured for provider: ${config.provider}`);
  }

  return {
    model: createModel(config.provider, config.model),
    apiKey,
  };
}
