import type { AgentType, AgentModelAssignment } from "@fictia/shared";
import { DEFAULT_AGENT_MODELS } from "@fictia/shared";
import { providerService } from "../services/provider.service.js";
import { buildModel } from "./providers.js";
import type { Model } from "@earendil-works/pi-ai";

export interface AgentModelConfig {
  model: Model<"openai-completions">;
  apiKey: string;
}

/**
 * Resolve the model + api key for an agent from the providers/models tables.
 * Stale references (provider/model later deleted) fall back to that provider's
 * first enabled model, so an outdated assignment never crashes a run.
 */
export function getModelForAgent(
  agentType: AgentType,
  agentModels?: Partial<Record<AgentType, AgentModelAssignment>>,
): AgentModelConfig {
  const config = agentModels?.[agentType] ?? DEFAULT_AGENT_MODELS[agentType];
  const resolved = providerService.resolveModel(config.providerId, config.modelId);
  if (!resolved) {
    throw new Error(
      `未找到 Agent「${agentType}」的模型（provider: ${config.providerId}, model: ${config.modelId}），请在设置中检查模型配置。`,
    );
  }
  const apiKey = resolved.provider.apiKey ?? "";
  if (!apiKey) {
    throw new Error(`未配置 API Key：${resolved.provider.name}，请在设置中填写。`);
  }
  return {
    model: buildModel(resolved.provider, resolved.model),
    apiKey,
  };
}
