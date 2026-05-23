import type { Model } from "@earendil-works/pi-ai";

export const PROVIDER_CONFIGS: Record<string, { baseUrl: string }> = {
  glm: {
    baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
  },
  minimax: {
    baseUrl: "https://api.minimax.chat/v1",
  },
  doubao: {
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  },
};

export function createModel(
  provider: string,
  modelId: string,
): Model<"openai-completions"> {
  const config = PROVIDER_CONFIGS[provider];
  if (!config) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  return {
    id: modelId,
    name: `${provider}/${modelId}`,
    api: "openai-completions",
    provider,
    baseUrl: config.baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  };
}
