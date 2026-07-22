import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { DEFAULT_AGENT_MODELS } from "../../../../packages/shared/src/constants.js";

const now = () => new Date().toISOString();

function maskKey(key: string): string {
  if (!key || key.length < 8) return "****";
  return "****" + key.slice(-4);
}

function getSettingValue(key: string): string | undefined {
  const row = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .get();
  return row?.value ?? undefined;
}

function setSettingValue(key: string, value: string) {
  const existing = getSettingValue(key);
  const timestamp = now();

  if (existing !== undefined) {
    db.update(schema.settings)
      .set({ value, updatedAt: timestamp })
      .where(eq(schema.settings.key, key))
      .run();
  } else {
    db.insert(schema.settings)
      .values({ key, value, updatedAt: timestamp })
      .run();
  }
}

export const settingsService = {
  get() {
    const apiKeyGlm = getSettingValue("apiKeyGlm") ?? "";
    const apiKeyMinimax = getSettingValue("apiKeyMinimax") ?? "";
    const apiKeyDoubao = getSettingValue("apiKeyDoubao") ?? "";

    let agentModels: Record<string, { provider: string; model: string }> = { ...DEFAULT_AGENT_MODELS };
    const agentModelsRaw = getSettingValue("agentModels");
    if (agentModelsRaw) {
      try {
        const parsed = JSON.parse(agentModelsRaw);
        if (parsed && typeof parsed === "object") {
          agentModels = { ...DEFAULT_AGENT_MODELS, ...parsed };
        }
      } catch {
        // fall back to defaults
      }
    }

    const chatPersona = getSettingValue("chatPersona") ?? "";
    const manualConfirm = getSettingValue("manualConfirm") === "true";
    const embeddingProvider =
      (getSettingValue("embeddingProvider") as
        | "glm"
        | "bge-m3"
        | undefined) ?? "glm";

    return {
      apiKeyGlm: maskKey(apiKeyGlm),
      apiKeyMinimax: maskKey(apiKeyMinimax),
      apiKeyDoubao: maskKey(apiKeyDoubao),
      agentModels,
      chatPersona,
      manualConfirm,
      embeddingProvider,
    };
  },

  update(data: Partial<{
    apiKeyGlm: string;
    apiKeyMinimax: string;
    apiKeyDoubao: string;
    agentModels: Record<string, { provider: string; model: string }>;
    chatPersona: string;
    manualConfirm: boolean;
    embeddingProvider: "glm" | "bge-m3";
  }>) {
    // Skip masked keys (****xxxx) - only save real keys
    if (data.apiKeyGlm !== undefined && !data.apiKeyGlm.startsWith("****")) setSettingValue("apiKeyGlm", data.apiKeyGlm);
    if (data.apiKeyMinimax !== undefined && !data.apiKeyMinimax.startsWith("****")) setSettingValue("apiKeyMinimax", data.apiKeyMinimax);
    if (data.apiKeyDoubao !== undefined && !data.apiKeyDoubao.startsWith("****")) setSettingValue("apiKeyDoubao", data.apiKeyDoubao);
    if (data.agentModels !== undefined) setSettingValue("agentModels", JSON.stringify(data.agentModels));
    if (data.chatPersona !== undefined) setSettingValue("chatPersona", data.chatPersona);
    if (data.manualConfirm !== undefined) setSettingValue("manualConfirm", data.manualConfirm ? "true" : "false");
    if (data.embeddingProvider !== undefined) setSettingValue("embeddingProvider", data.embeddingProvider);

    return this.get();
  },

  getApiKeys() {
    return {
      glm: getSettingValue("apiKeyGlm") ?? "",
      minimax: getSettingValue("apiKeyMinimax") ?? "",
      doubao: getSettingValue("apiKeyDoubao") ?? "",
    };
  },

  getEmbeddingProvider(): "glm" | "bge-m3" {
    return (getSettingValue("embeddingProvider") as
      | "glm"
      | "bge-m3"
      | undefined) ?? "glm";
  },
};
