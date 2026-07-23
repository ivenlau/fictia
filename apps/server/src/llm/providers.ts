import type { Model } from "@earendil-works/pi-ai";
import type { ProviderRow, ModelRow } from "../services/provider.service.js";

/**
 * Build a pi-ai Model descriptor from DB rows. The provider row holds the
 * baseUrl + api key, the model row holds token/context metadata.
 */
export function buildModel(provider: ProviderRow, model: ModelRow): Model<"openai-completions"> {
  return {
    id: model.id,
    name: `${provider.id}/${model.id}`,
    api: "openai-completions",
    provider: provider.id,
    baseUrl: provider.baseUrl,
    reasoning: !!model.reasoning,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: model.contextWindow ?? 128000,
    maxTokens: model.maxTokens ?? 8192,
  };
}
