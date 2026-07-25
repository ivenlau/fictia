import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { DEFAULT_AGENT_MODELS, DEFAULT_CHAT_MODEL, DEFAULT_SYSTEM_MODEL } from "@fictia/shared";
import type { AgentType, AgentModelAssignment } from "@fictia/shared";
import { providerService } from "./provider.service.js";

const now = () => new Date().toISOString();

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
    let agentModels: Partial<Record<AgentType, AgentModelAssignment>> = { ...DEFAULT_AGENT_MODELS };
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
      (getSettingValue("embeddingProvider") as "glm" | "bge-m3" | undefined) ?? "glm";
    const embeddingModelDir = getSettingValue("embeddingModelDir") ?? "";
    const embeddingApiKey = getSettingValue("embeddingApiKey") ?? "";

    let chatModel: AgentModelAssignment = { ...DEFAULT_CHAT_MODEL };
    const chatModelRaw = getSettingValue("chatModel");
    if (chatModelRaw) {
      try {
        const parsed = JSON.parse(chatModelRaw);
        if (parsed && typeof parsed === "object" && parsed.providerId && parsed.modelId) {
          chatModel = { providerId: parsed.providerId, modelId: parsed.modelId };
        }
      } catch {
        // fall back to default
      }
    }

    let systemModel: AgentModelAssignment = { ...DEFAULT_SYSTEM_MODEL };
    const systemModelRaw = getSettingValue("systemModel");
    if (systemModelRaw) {
      try {
        const parsed = JSON.parse(systemModelRaw);
        if (parsed && typeof parsed === "object" && parsed.providerId && parsed.modelId) {
          systemModel = { providerId: parsed.providerId, modelId: parsed.modelId };
        }
      } catch {
        // fall back to default
      }
    }

    return { agentModels, chatPersona, chatModel, systemModel, manualConfirm, embeddingProvider, embeddingModelDir, embeddingApiKey };
  },

  update(
    data: Partial<{
      agentModels: Partial<Record<AgentType, AgentModelAssignment>>;
      chatPersona: string;
      chatModel: AgentModelAssignment;
      systemModel: AgentModelAssignment;
      manualConfirm: boolean;
      embeddingProvider: "glm" | "bge-m3";
      embeddingModelDir: string;
      embeddingApiKey: string;
    }>,
  ) {
    if (data.agentModels !== undefined) setSettingValue("agentModels", JSON.stringify(data.agentModels));
    if (data.chatPersona !== undefined) setSettingValue("chatPersona", data.chatPersona);
    if (data.chatModel !== undefined) setSettingValue("chatModel", JSON.stringify(data.chatModel));
    if (data.systemModel !== undefined) setSettingValue("systemModel", JSON.stringify(data.systemModel));
    if (data.manualConfirm !== undefined) setSettingValue("manualConfirm", data.manualConfirm ? "true" : "false");
    if (data.embeddingProvider !== undefined) setSettingValue("embeddingProvider", data.embeddingProvider);
    if (data.embeddingModelDir !== undefined) setSettingValue("embeddingModelDir", data.embeddingModelDir);
    if (data.embeddingApiKey !== undefined) setSettingValue("embeddingApiKey", data.embeddingApiKey);

    return this.get();
  },

  getEmbeddingProvider(): "glm" | "bge-m3" {
    return (getSettingValue("embeddingProvider") as "glm" | "bge-m3" | undefined) ?? "glm";
  },

  /** bge-m3 本地模型目录（空=远程下载 Xenova/bge-m3）。 */
  getEmbeddingModelDir(): string {
    return getSettingValue("embeddingModelDir")?.trim() ?? "";
  },

  /** GLM embedding key：优先 embedding 专用 key，回退 providers 表的 GLM key。 */
  getEmbeddingGlmKey(): string {
    const k = getSettingValue("embeddingApiKey");
    return k && k.trim() ? k : providerService.getGlmKey();
  },
};
