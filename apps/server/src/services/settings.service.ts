import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { DEFAULT_AGENT_MODELS } from "@fictia/shared";
import type { AgentType, AgentModelAssignment } from "@fictia/shared";

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

    return { agentModels, chatPersona, manualConfirm, embeddingProvider };
  },

  update(
    data: Partial<{
      agentModels: Partial<Record<AgentType, AgentModelAssignment>>;
      chatPersona: string;
      manualConfirm: boolean;
      embeddingProvider: "glm" | "bge-m3";
    }>,
  ) {
    if (data.agentModels !== undefined) setSettingValue("agentModels", JSON.stringify(data.agentModels));
    if (data.chatPersona !== undefined) setSettingValue("chatPersona", data.chatPersona);
    if (data.manualConfirm !== undefined) setSettingValue("manualConfirm", data.manualConfirm ? "true" : "false");
    if (data.embeddingProvider !== undefined) setSettingValue("embeddingProvider", data.embeddingProvider);

    return this.get();
  },

  getEmbeddingProvider(): "glm" | "bge-m3" {
    return (getSettingValue("embeddingProvider") as "glm" | "bge-m3" | undefined) ?? "glm";
  },
};
