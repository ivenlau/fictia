/**
 * 自定义工具 CRUD + 校验 + 测试。
 *
 * CustomToolDef ↔ DB 行互转（parameters/kind 存 JSON 字符串）。全局资源（不绑 novel）。
 * name 合法性 + 唯一性 + JSON Schema 合法性校验。test 复用 runCustomToolKind。
 */
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db, schema } from "../db/index.js";
import { runCustomToolKind, type ToolRunCtx } from "../tools/custom-tool-runner.js";
import type { CustomToolDef, CustomToolKind, JsonSchema, TestToolResult, ToolTier } from "@fictia/shared";

type Row = typeof schema.customTools.$inferSelect;

const NAME_RE = /^[a-z][a-z0-9_]*$/;

function rowToDef(row: Row): CustomToolDef {
  let parameters: JsonSchema = { type: "object", properties: {} };
  try {
    parameters = JSON.parse(row.parameters ?? "") as JsonSchema;
  } catch {
    // 非法 JSON 用空 schema
  }
  let kind: CustomToolKind;
  try {
    kind = JSON.parse(row.kind) as CustomToolKind;
  } catch {
    kind = { kind: "llm", systemPrompt: "", inputTemplate: "" };
  }
  return {
    id: row.id,
    name: row.name,
    label: row.label,
    description: row.description ?? "",
    tier: (row.tier ?? "readonly") as ToolTier,
    parameters,
    kind,
    enabled: !!row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function validateDef(def: Partial<CustomToolDef>, excludeId?: string): string | null {
  if (def.name !== undefined) {
    if (typeof def.name !== "string" || !NAME_RE.test(def.name)) {
      return `工具名非法（须匹配 ${NAME_RE}）：${def.name}`;
    }
    // 唯一性
    const dup = db
      .select()
      .from(schema.customTools)
      .where(eq(schema.customTools.name, def.name))
      .all()
      .find((r) => r.id !== excludeId);
    if (dup) return `工具名已存在：${def.name}`;
  }
  if (def.parameters !== undefined) {
    if (typeof def.parameters !== "object" || def.parameters === null) return "parameters 必须是 JSON Schema 对象";
  }
  if (def.kind !== undefined) {
    const k = def.kind;
    if (!k || typeof k !== "object") return "kind 非法";
    if (k.kind === "llm") {
      if (typeof (k as any).systemPrompt !== "string" || typeof (k as any).inputTemplate !== "string") return "llm 工具需 systemPrompt + inputTemplate";
    } else if (k.kind === "http") {
      if (typeof (k as any).urlTemplate !== "string") return "http 工具需 urlTemplate";
    } else if (k.kind === "js") {
      if (typeof (k as any).code !== "string") return "js 工具需 code";
    } else {
      return `未知 kind: ${(k as any).kind}`;
    }
  }
  return null;
}

export const customToolService = {
  list(): CustomToolDef[] {
    return db.select().from(schema.customTools).orderBy(schema.customTools.createdAt).all().map(rowToDef);
  },

  /** 所有启用中的自定义工具名（供 chat 助手等按名注入工具集）。 */
  enabledToolNames(): string[] {
    return db
      .select({ name: schema.customTools.name })
      .from(schema.customTools)
      .where(eq(schema.customTools.enabled, 1))
      .all()
      .map((r) => r.name);
  },

  get(id: string): CustomToolDef | null {
    const row = db.select().from(schema.customTools).where(eq(schema.customTools.id, id)).get();
    return row ? rowToDef(row) : null;
  },

  create(input: Omit<CustomToolDef, "id" | "createdAt" | "updatedAt">): CustomToolDef {
    const err = validateDef(input);
    if (err) throw new Error(err);
    const now = new Date().toISOString();
    const def: CustomToolDef = {
      ...input,
      id: uuid(),
      createdAt: now,
      updatedAt: now,
    };
    db.insert(schema.customTools)
      .values({
        id: def.id,
        name: def.name,
        label: def.label,
        description: def.description ?? "",
        tier: def.tier,
        parameters: JSON.stringify(def.parameters),
        kind: JSON.stringify(def.kind),
        enabled: def.enabled ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return def;
  },

  update(id: string, patch: Partial<CustomToolDef>): CustomToolDef {
    const existing = this.get(id);
    if (!existing) throw new Error(`工具不存在：${id}`);
    const merged: CustomToolDef = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
    const err = validateDef(merged, id);
    if (err) throw new Error(err);
    db.update(schema.customTools)
      .set({
        name: merged.name,
        label: merged.label,
        description: merged.description ?? "",
        tier: merged.tier,
        parameters: JSON.stringify(merged.parameters),
        kind: JSON.stringify(merged.kind),
        enabled: merged.enabled ? 1 : 0,
        updatedAt: merged.updatedAt,
      })
      .where(eq(schema.customTools.id, id))
      .run();
    return merged;
  },

  remove(id: string): void {
    db.delete(schema.customTools).where(eq(schema.customTools.id, id)).run();
  },

  /** 测试一个已保存的工具。 */
  async testById(id: string, params: Record<string, unknown>, ctx: ToolRunCtx): Promise<TestToolResult> {
    const def = this.get(id);
    if (!def) return { ok: false, error: `工具不存在：${id}` };
    return this.testDef(def, params, ctx);
  },

  /** 测试一个临时 def（编辑器里未保存时预览）。 */
  async testDef(def: CustomToolDef, params: Record<string, unknown>, ctx: ToolRunCtx): Promise<TestToolResult> {
    const res = await runCustomToolKind(def, params, ctx);
    return { ok: res.ok, output: res.output, error: res.error, durationMs: res.durationMs };
  },
};
