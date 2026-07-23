import { eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db, schema } from "../db/index.js";
import { PRESET_PROVIDERS } from "@fictia/shared";
import type { ProviderInfo, ModelInfo, ProviderType, ApiFormat } from "@fictia/shared";

const now = () => new Date().toISOString();

// ---- settings helpers (local, to avoid circular dep with settings.service) ----
function getSettingValue(key: string): string | undefined {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  return row?.value ?? undefined;
}
function setSettingValue(key: string, value: string) {
  const ts = now();
  const existing = getSettingValue(key);
  if (existing !== undefined) {
    db.update(schema.settings).set({ value, updatedAt: ts }).where(eq(schema.settings.key, key)).run();
  } else {
    db.insert(schema.settings).values({ key, value, updatedAt: ts }).run();
  }
}

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length < 8) return "****";
  return "****" + key.slice(-4);
}

export type ProviderRow = typeof schema.providers.$inferSelect;
export type ModelRow = typeof schema.models.$inferSelect;

function toModelInfo(m: ModelRow): ModelInfo {
  return {
    id: m.id,
    providerId: m.providerId,
    type: m.type as ProviderType,
    name: m.name,
    contextWindow: m.contextWindow ?? 128000,
    maxTokens: m.maxTokens ?? 8192,
    reasoning: !!m.reasoning,
    enabled: !!m.enabled,
    sort: m.sort,
  };
}

function toProviderInfo(p: ProviderRow, models: ModelRow[], mask = true): ProviderInfo {
  return {
    id: p.id,
    type: p.type as ProviderType,
    presetKey: p.presetKey,
    name: p.name,
    baseUrl: p.baseUrl,
    apiFormat: p.apiFormat as ApiFormat,
    apiKey: mask ? maskKey(p.apiKey ?? "") : p.apiKey ?? "",
    enabled: !!p.enabled,
    sort: p.sort,
    models: models.map(toModelInfo),
  };
}

function getModelsFor(providerId: string): ModelRow[] {
  return db
    .select()
    .from(schema.models)
    .where(eq(schema.models.providerId, providerId))
    .orderBy(schema.models.sort)
    .all();
}

export const providerService = {
  // ===== listing (masked, for UI) =====
  list(): ProviderInfo[] {
    const pros = db.select().from(schema.providers).orderBy(schema.providers.sort, schema.providers.createdAt).all();
    return pros.map((p) => toProviderInfo(p, getModelsFor(p.id)));
  },

  listUsable(): ProviderInfo[] {
    const pros = db.select().from(schema.providers).where(eq(schema.providers.enabled, 1)).orderBy(schema.providers.sort).all();
    return pros
      .map((p) => toProviderInfo(p, getModelsFor(p.id).filter((m) => m.enabled)))
      .filter((p) => p.models.length > 0);
  },

  get(id: string): ProviderInfo | undefined {
    const p = this.getRaw(id);
    if (!p) return undefined;
    return toProviderInfo(p, getModelsFor(id));
  },

  // ===== raw rows (unmasked key, for runtime) =====
  getRaw(id: string): ProviderRow | undefined {
    return db.select().from(schema.providers).where(eq(schema.providers.id, id)).get();
  },

  getRawModel(providerId: string, modelId: string): ModelRow | undefined {
    return db
      .select()
      .from(schema.models)
      .where(and(eq(schema.models.providerId, providerId), eq(schema.models.id, modelId)))
      .get();
  },

  // resolve a provider+model for runtime LLM calls; falls back to first enabled
  // model if the exact one is gone, so stale agentModels never crash a run.
  resolveModel(providerId: string, modelId: string): { provider: ProviderRow; model: ModelRow } | undefined {
    const provider = this.getRaw(providerId);
    if (!provider) return undefined;
    let model = this.getRawModel(providerId, modelId);
    if (!model) {
      model = getModelsFor(providerId).find((m) => m.enabled);
    }
    if (!model) return undefined;
    return { provider, model };
  },

  // ===== provider CRUD =====
  create(data: { name: string; baseUrl: string; apiFormat?: string; apiKey?: string; enabled?: boolean }): ProviderInfo {
    const id = uuid();
    const ts = now();
    db.insert(schema.providers)
      .values({
        id,
        type: "custom",
        presetKey: null,
        name: data.name,
        baseUrl: data.baseUrl,
        apiFormat: data.apiFormat ?? "openai",
        apiKey: data.apiKey ?? "",
        enabled: data.enabled === false ? 0 : 1,
        sort: db.select().from(schema.providers).all().length,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return toProviderInfo(this.getRaw(id)!, []);
  },

  update(
    id: string,
    data: Partial<{ name: string; baseUrl: string; apiFormat: string; apiKey: string; enabled: boolean }>,
  ): ProviderInfo | undefined {
    const existing = this.getRaw(id);
    if (!existing) return undefined;
    const patch: Partial<ProviderRow> = { updatedAt: now() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.baseUrl !== undefined) patch.baseUrl = data.baseUrl;
    if (data.apiFormat !== undefined) patch.apiFormat = data.apiFormat;
    if (data.enabled !== undefined) patch.enabled = data.enabled ? 1 : 0;
    // skip masked keys (****xxxx) — only persist real keys
    if (data.apiKey !== undefined && !data.apiKey.startsWith("****")) patch.apiKey = data.apiKey;
    db.update(schema.providers).set(patch).where(eq(schema.providers.id, id)).run();
    return toProviderInfo(this.getRaw(id)!, getModelsFor(id));
  },

  remove(id: string): boolean {
    const existing = this.getRaw(id);
    if (!existing) return false;
    if (existing.type === "preset") return false; // preset providers can only be disabled
    db.delete(schema.providers).where(eq(schema.providers.id, id)).run();
    return true;
  },

  // ===== model CRUD =====
  addModel(
    providerId: string,
    data: { id?: string; name: string; contextWindow?: number; maxTokens?: number; reasoning?: boolean; enabled?: boolean },
  ): ModelInfo | undefined {
    const provider = this.getRaw(providerId);
    if (!provider) return undefined;
    const id = data.id || uuid();
    const ts = now();
    db.insert(schema.models)
      .values({
        id,
        providerId,
        type: "custom",
        name: data.name,
        contextWindow: data.contextWindow ?? 128000,
        maxTokens: data.maxTokens ?? 8192,
        reasoning: data.reasoning ? 1 : 0,
        enabled: data.enabled === false ? 0 : 1,
        sort: getModelsFor(providerId).length,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return toModelInfo(this.getRawModel(providerId, id)!);
  },

  updateModel(
    providerId: string,
    modelId: string,
    data: Partial<{ name: string; contextWindow: number; maxTokens: number; reasoning: boolean; enabled: boolean }>,
  ): ModelInfo | undefined {
    const existing = this.getRawModel(providerId, modelId);
    if (!existing) return undefined;
    const patch: Partial<ModelRow> = { updatedAt: now() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.contextWindow !== undefined) patch.contextWindow = data.contextWindow;
    if (data.maxTokens !== undefined) patch.maxTokens = data.maxTokens;
    if (data.reasoning !== undefined) patch.reasoning = data.reasoning ? 1 : 0;
    if (data.enabled !== undefined) patch.enabled = data.enabled ? 1 : 0;
    db.update(schema.models)
      .set(patch)
      .where(and(eq(schema.models.providerId, providerId), eq(schema.models.id, modelId)))
      .run();
    return toModelInfo(this.getRawModel(providerId, modelId)!);
  },

  removeModel(providerId: string, modelId: string): boolean {
    const existing = this.getRawModel(providerId, modelId);
    if (!existing) return false;
    if (existing.type === "preset") {
      // soft-delete: keep row, disable
      db.update(schema.models)
        .set({ enabled: 0, updatedAt: now() })
        .where(and(eq(schema.models.providerId, providerId), eq(schema.models.id, modelId)))
        .run();
      return true;
    }
    db.delete(schema.models)
      .where(and(eq(schema.models.providerId, providerId), eq(schema.models.id, modelId)))
      .run();
    return true;
  },

  // restore a provider's models to the preset definition (for preset providers)
  resetPresetModels(providerId: string): ProviderInfo | undefined {
    const p = this.getRaw(providerId);
    if (!p || !p.presetKey) return undefined;
    const def = PRESET_PROVIDERS.find((d) => d.key === p.presetKey);
    if (!def) return undefined;
    // remove custom models, re-enable preset ones
    const rows = getModelsFor(providerId);
    const ts = now();
    for (const m of rows) {
      if (m.type === "custom") {
        db.delete(schema.models).where(and(eq(schema.models.providerId, providerId), eq(schema.models.id, m.id))).run();
      }
    }
    def.models.forEach((mdef, mi) => {
      const exists = this.getRawModel(providerId, mdef.id);
      if (exists) {
        db.update(schema.models)
          .set({ enabled: 1, name: mdef.name, sort: mi, updatedAt: ts })
          .where(and(eq(schema.models.providerId, providerId), eq(schema.models.id, mdef.id)))
          .run();
      } else {
        db.insert(schema.models)
          .values({
            id: mdef.id,
            providerId,
            type: "preset",
            name: mdef.name,
            contextWindow: mdef.contextWindow ?? 128000,
            maxTokens: mdef.maxTokens ?? 8192,
            reasoning: mdef.reasoning ? 1 : 0,
            enabled: 1,
            sort: mi,
            createdAt: ts,
            updatedAt: ts,
          })
          .run();
      }
    });
    return toProviderInfo(p, getModelsFor(providerId));
  },

  // ===== embedding needs the GLM key (token endpoint preferred, coding fallback) =====
  getGlmKey(): string {
    for (const key of ["glm", "glm-coding"]) {
      const row = db.select().from(schema.providers).where(eq(schema.providers.presetKey, key)).get();
      if (row?.apiKey) return row.apiKey;
    }
    return "";
  },

  // ===== connection test =====
  async testConnection(id: string, overrideKey?: string): Promise<{ ok: boolean; error?: string }> {
    const provider = this.getRaw(id);
    if (!provider) return { ok: false, error: "Provider not found" };
    const apiKey = overrideKey && !overrideKey.startsWith("****") ? overrideKey : provider.apiKey ?? "";
    if (!apiKey) return { ok: false, error: "API key not configured" };
    const firstModel = getModelsFor(id).find((m) => m.enabled);
    if (!firstModel) return { ok: false, error: "No enabled model to test" };
    try {
      const res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: firstModel.id,
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 5,
        }),
      });
      if (res.ok) return { ok: true };
      const body = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? "Connection failed" };
    }
  },

  // ===== startup: seed presets + one-time migration =====
  init() {
    const count = db.select().from(schema.providers).all().length;
    if (count === 0) this._seedPresets();
    if (getSettingValue("migratedProvidersV1") !== "true") {
      this._migrateOldKeys();
      this._migrateAgentModels();
      setSettingValue("migratedProvidersV1", "true");
    }
  },

  _seedPresets() {
    const ts = now();
    PRESET_PROVIDERS.forEach((def, idx) => {
      db.insert(schema.providers)
        .values({
          id: def.key,
          type: "preset",
          presetKey: def.key,
          name: def.name,
          baseUrl: def.baseUrl,
          apiFormat: def.apiFormat,
          apiKey: "",
          enabled: 1,
          sort: idx,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      def.models.forEach((m, mi) => {
        db.insert(schema.models)
          .values({
            id: m.id,
            providerId: def.key,
            type: "preset",
            name: m.name,
            contextWindow: m.contextWindow ?? 128000,
            maxTokens: m.maxTokens ?? 8192,
            reasoning: m.reasoning ? 1 : 0,
            enabled: 1,
            sort: mi,
            createdAt: ts,
            updatedAt: ts,
          })
          .run();
      });
    });
  },

  _migrateOldKeys() {
    // old runtime used the GLM coding endpoint, so apiKeyGlm → glm-coding
    const map: Array<{ settingKey: string; presetKey: string }> = [
      { settingKey: "apiKeyGlm", presetKey: "glm-coding" },
      { settingKey: "apiKeyMinimax", presetKey: "minimax" },
      { settingKey: "apiKeyDoubao", presetKey: "doubao" },
    ];
    for (const { settingKey, presetKey } of map) {
      const key = getSettingValue(settingKey);
      if (!key) continue;
      const row = db.select().from(schema.providers).where(eq(schema.providers.presetKey, presetKey)).get();
      if (row) {
        db.update(schema.providers).set({ apiKey: key, updatedAt: now() }).where(eq(schema.providers.id, row.id)).run();
      }
    }
  },

  _migrateAgentModels() {
    const raw = getSettingValue("agentModels");
    if (!raw) return;
    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object") return;

    const oldProviderToId: Record<string, string> = {
      glm: "glm-coding",
      minimax: "minimax",
      doubao: "doubao",
    };

    let changed = false;
    const out: Record<string, { providerId: string; modelId: string }> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (!v || typeof v !== "object") continue;
      if (v.providerId && v.modelId) {
        out[k] = { providerId: v.providerId, modelId: v.modelId };
      } else if (v.provider && v.model) {
        const providerId = oldProviderToId[v.provider] ?? v.provider;
        out[k] = { providerId, modelId: this._ensureModelExists(providerId, v.model) };
        changed = true;
      }
    }
    if (changed) setSettingValue("agentModels", JSON.stringify(out));
  },

  _ensureModelExists(providerId: string, modelId: string): string {
    if (this.getRawModel(providerId, modelId)) return modelId;
    const firstEnabled = getModelsFor(providerId).find((m) => m.enabled);
    if (firstEnabled) return firstEnabled.id;
    this.addModel(providerId, { id: modelId, name: modelId });
    return modelId;
  },
};
