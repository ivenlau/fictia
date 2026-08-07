/**
 * 工具生成 agent：用户自然语言描述 → 一个合法的 CustomToolDef JSON（不落库）。
 *
 * system prompt（templates/agents/tool-generator/system.md）讲清本系统工具契约 + 3 种 kind +
 * few-shot。用系统默认模型调用，zod 校验输出；解析失败把错误回喂模型重试一次。最终由前端
 * 拿到 def 进编辑器预览/测试/保存（用户始终有最终决定权）。
 */
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { runCustomCall } from "./custom-agent.js";
import { loadPromptTemplate } from "../utils/prompt-loader.js";
import { resolveDefaultModelAssignment } from "../tools/custom-tool-runner.js";
import type { CustomToolDef, CustomToolKind, ToolTier, JsonSchema } from "@fictia/shared";

const NAME_RE = /^[a-z][a-z0-9_]*$/;

const kindSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("llm"),
    systemPrompt: z.string(),
    inputTemplate: z.string(),
    model: z.any().optional().nullable(),
    tools: z.array(z.string()).optional(),
    maxIterations: z.number().optional(),
  }),
  z.object({
    kind: z.literal("http"),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    urlTemplate: z.string(),
    headers: z.record(z.string()).optional(),
    bodyTemplate: z.string().nullable().optional(),
    responseExtract: z.string().nullable().optional(),
  }),
  z.object({
    kind: z.literal("js"),
    code: z.string(),
  }),
]);

const defSchema = z.object({
  name: z.string().regex(NAME_RE, "name 须 lower_snake_case（^[a-z][a-z0-9_]*$）"),
  label: z.string(),
  description: z.string(),
  tier: z.enum(["readonly", "write", "orchestrate"]).default("readonly"),
  parameters: z.record(z.any()),
  kind: kindSchema,
});

/** 从模型输出里提取 JSON（去 ```json 围栏 / 截取首尾大括号）。 */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

function parseAndNormalize(text: string): CustomToolDef {
  const obj = JSON.parse(extractJson(text));
  const parsed = defSchema.parse(obj);
  const now = new Date().toISOString();
  return {
    id: uuid(),
    name: parsed.name,
    label: parsed.label,
    description: parsed.description,
    tier: parsed.tier as ToolTier,
    parameters: parsed.parameters as JsonSchema,
    kind: parsed.kind as CustomToolKind,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

/** 生成一个自定义工具定义（不落库）。 */
export async function generateCustomTool(
  description: string,
  preferKind?: CustomToolKind["kind"],
): Promise<CustomToolDef> {
  const systemPrompt = await loadPromptTemplate("tool-generator");
  const model = resolveDefaultModelAssignment();
  if (!model) {
    throw new Error("未配置默认模型（请在设置里配 systemModel，或给 tool-generator 指定模型）。");
  }

  let lastErr = "未知错误";
  for (let attempt = 0; attempt < 2; attempt++) {
    const input =
      attempt === 0
        ? `用户需求：${description}${preferKind ? `\n倾向种类：${preferKind}` : ""}\n\n请直接输出一个合法的自定义工具 JSON。`
        : `上次输出解析失败：${lastErr}\n请修正后重新输出一个合法的 JSON（只输出 JSON 本身）。\n\n用户需求：${description}`;
    const res = await runCustomCall({
      novelDir: process.cwd(),
      systemPrompt,
      input,
      model,
    });
    try {
      return parseAndNormalize(res.output);
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`生成工具解析失败（重试后仍不合法）：${lastErr}`);
}
