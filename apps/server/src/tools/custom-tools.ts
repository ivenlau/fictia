/**
 * 自定义工具工厂：读 custom_tools 表（enabled），逐个构造 FictiaTool 注册进 ToolRegistry。
 *
 * 注册后自定义工具即可被任意流程按名选用（toolRegistry.getTools(ctx, names) 自动包含），
 * 也出现在 listAllNames 里供前端选择。CRUD 后下次 getTools 重建即热生效（无需重启）。
 *
 * 原始 JSON Schema 经 typebox Type.Unsafe 适配为 TSchema（symbol 键在序列化时被丢弃，
 * LLM 拿到干净 JSON Schema；校验即使无法 compile 也安全跳过）。
 */
import { eq } from "drizzle-orm";
import { Type, type TSchema } from "@earendil-works/pi-ai";
import { db, schema } from "../db/index.js";
import type { FictiaTool, ToolContext } from "./types.js";
import type { CustomToolDef, ToolTier } from "@fictia/shared";
import { runCustomToolKind } from "./custom-tool-runner.js";

function rowToDef(row: typeof schema.customTools.$inferSelect): CustomToolDef {
  let parameters: Record<string, unknown> = { type: "object", properties: {} };
  try {
    parameters = JSON.parse(row.parameters ?? '{"type":"object","properties":{}}');
  } catch {
    // 非法 JSON 用空 schema 兜底
  }
  let kind: CustomToolDef["kind"];
  try {
    kind = JSON.parse(row.kind) as CustomToolDef["kind"];
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

export function createCustomTools(ctx: ToolContext): FictiaTool[] {
  let rows: (typeof schema.customTools.$inferSelect)[];
  try {
    rows = db
      .select()
      .from(schema.customTools)
      .where(eq(schema.customTools.enabled, 1))
      .all();
  } catch (e) {
    console.warn("[custom-tools] 读取自定义工具失败（不阻塞）", e);
    return [];
  }
  return rows.map((row) => {
    const def = rowToDef(row);
    const tool: FictiaTool = {
      name: def.name,
      label: def.label,
      description: def.description,
      tier: def.tier,
      tags: ["custom"],
      parameters: Type.Unsafe(def.parameters as TSchema),
      async execute(_toolCallId, params) {
        try {
          const res = await runCustomToolKind(def, (params as Record<string, unknown>) ?? {}, ctx);
          if (!res.ok) {
            return { content: [{ type: "text", text: `工具错误：${res.error ?? "未知错误"}` }], details: { error: res.error } };
          }
          return {
            content: [{ type: "text", text: res.output ?? "" }],
            details: { durationMs: res.durationMs },
          };
        } catch (e: any) {
          return {
            content: [{ type: "text", text: `工具执行异常：${e?.message ?? String(e)}` }],
            details: { error: e?.message },
          };
        }
      },
    };
    return tool;
  });
}
