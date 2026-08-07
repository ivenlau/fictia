/**
 * 自定义工具执行器：按 CustomToolKind dispatch 到 llm / http / js。
 *
 * - llm：用 inputTemplate 把工具入参插值成 user message，调一次指定模型，返回文本。
 * - http：按 templates 构造请求（{{param}} 插值），fetch（30s 超时），responseExtract 提取。
 * - js：在 worker_threads 子进程里跑用户代码（注入 {params, novelId, novelDir, helpers}），
 *        10s 超时杀掉。helper 白名单按 tier 收敛（readonly 禁写）。
 *
 * 本地单用户形态：worker 仅做健壮性隔离（防死循环/崩溃），不防恶意代码。
 */
import { Worker } from "worker_threads";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { runCustomCall } from "../agents/custom-agent.js";
import type { AgentModelAssignment, CustomToolDef, CustomToolKind } from "@fictia/shared";

export interface ToolRunCtx {
  novelId: string;
  novelDir: string;
}

export interface ToolRunResult {
  ok: boolean;
  output?: string;
  error?: string;
  durationMs?: number;
}

/** {{param}} 插值（params 里没有的占位符替换为空串）。 */
function fillTemplate(tpl: string, params: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = key.split(".").reduce<unknown>((acc, k) => (acc == null ? acc : (acc as Record<string, unknown>)[k]), params);
    return v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  });
}

/** 解析默认模型（llm 工具未指定 model 时）：settings.systemModel → 第一个可用 provider/model。 */
export function resolveDefaultModelAssignment(): AgentModelAssignment | undefined {
  const sysRow = db.select().from(schema.settings).where(eq(schema.settings.key, "systemModel")).get();
  if (sysRow?.value) {
    try {
      const v = JSON.parse(sysRow.value);
      if (v && v.providerId && v.modelId) return v as AgentModelAssignment;
    } catch {
      // 忽略非法 JSON
    }
  }
  const p = db
    .select()
    .from(schema.providers)
    .where(eq(schema.providers.enabled, 1))
    .orderBy(schema.providers.sort)
    .all()[0];
  if (!p) return undefined;
  const m = db
    .select()
    .from(schema.models)
    .where(eq(schema.models.providerId, p.id))
    .all()
    .find((x) => x.enabled);
  if (!m) return undefined;
  return { providerId: p.id, modelId: m.id };
}

/** 运行 llm 工具：带自定义子提示词的 LLM 调用。配 tools 时走 agentic 子循环（可多轮多工具调用）。 */
async function runLlmTool(kind: Extract<CustomToolKind, { kind: "llm" }>, params: Record<string, unknown>, ctx: ToolRunCtx): Promise<ToolRunResult> {
  const model = kind.model ?? resolveDefaultModelAssignment();
  if (!model) return { ok: false, error: "未配置默认模型（请在设置里配 systemModel 或给工具指定 model）" };
  const input = fillTemplate(kind.inputTemplate, params);
  try {
    const res = await runCustomCall({
      novelDir: ctx.novelDir,
      systemPrompt: kind.systemPrompt,
      input,
      model,
      // 配 tools 时，runAgentSession 走 agentic 循环：子代理可在产出过程中按需调用这些工具（内置+自定义）、多次调用。
      tools: kind.tools,
      maxIterations: kind.maxIterations,
    });
    return { ok: true, output: res.output };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "llm 工具调用失败" };
  }
}

/** 运行 http 工具：模板插值 → fetch → 提取。 */
async function runHttpTool(kind: Extract<CustomToolKind, { kind: "http" }>, params: Record<string, unknown>): Promise<ToolRunResult> {
  const url = fillTemplate(kind.urlTemplate, params);
  const method = kind.method;
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(kind.headers ?? {})) headers[k] = fillTemplate(v, params);
  const body = kind.bodyTemplate ? fillTemplate(kind.bodyTemplate, params) : undefined;
  if (body && !headers["Content-Type"] && !headers["content-type"]) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  const start = Date.now();
  try {
    const resp = await fetch(url, { method, headers, body, signal: controller.signal });
    const text = await resp.text();
    const durationMs = Date.now() - start;
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}: ${text.slice(0, 500)}`, durationMs };
    const out = kind.responseExtract ? extractResponse(text, kind.responseExtract) : text;
    return { ok: true, output: out, durationMs };
  } catch (e: any) {
    return { ok: false, error: e?.name === "AbortError" ? "HTTP 请求超时（30s）" : (e?.message ?? "http 工具调用失败"), durationMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

/** 从响应文本提取：jsonpath（a.b.c，先尝试 JSON.parse）或 /正则/。 */
function extractResponse(text: string, spec: string): string {
  // 正则：/pattern/flags
  if (spec.startsWith("/")) {
    const m = spec.match(/^\/(.+)\/([gimsuy]*)$/s);
    if (m) {
      const re = new RegExp(m[1], m[2]);
      const found = re.exec(text);
      return found ? (found[1] ?? found[0]) : "";
    }
  }
  // jsonpath：按 . 分段取
  try {
    const json = JSON.parse(text);
    const parts = spec.split(".");
    let cur: unknown = json;
    for (const p of parts) {
      if (cur == null) return "";
      cur = (cur as Record<string, unknown>)[p];
    }
    return cur == null ? "" : typeof cur === "string" ? cur : JSON.stringify(cur);
  } catch {
    return text;
  }
}

/** worker 引导代码（纯 JS 字符串，eval 模式运行，避免 tsx/loader 问题）。 */
const WORKER_BOOTSTRAP = `
const { workerData, parentPort } = require('worker_threads');
const fs = require('fs/promises');
const nodePath = require('path');
(async () => {
  const { code, params, novelId, novelDir, tier } = workerData;
  const join = (rel) => nodePath.resolve(novelDir, rel);
  const helpers = {
    log: (...a) => parentPort ? null : undefined,
    fetch: (...a) => fetch(...a),
    readFile: (rel, enc) => fs.readFile(join(rel), enc),
    writeFile: (rel, data) => fs.writeFile(join(rel), data),
    listFiles: async (rel, opts) => {
      const dir = join(rel);
      const ents = await fs.readdir(dir, { withFileTypes: true });
      return ents.filter(e => e.isFile()).map(e => e.name);
    },
  };
  if (tier === 'readonly') delete helpers.writeFile;
  try {
    const fn = new Function('params', 'novelId', 'novelDir', 'helpers', 'return (async () => {\\n' + code + '\\n})();');
    const result = await fn(params, novelId, novelDir, helpers);
    parentPort.postMessage({ ok: true, result });
  } catch (e) {
    parentPort.postMessage({ ok: false, error: (e && e.message) ? e.message : String(e) });
  }
})();
`;

/** 运行 js 工具：worker_threads + 超时隔离。 */
async function runJsTool(kind: Extract<CustomToolKind, { kind: "js" }>, params: Record<string, unknown>, ctx: ToolRunCtx, tier: string, timeoutMs = 10_000): Promise<ToolRunResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const worker = new Worker(WORKER_BOOTSTRAP, { eval: true, workerData: { code: kind.code, params, novelId: ctx.novelId, novelDir: ctx.novelDir, tier } });
    const timer = setTimeout(() => {
      worker.terminate();
      resolve({ ok: false, error: `JS 工具执行超时（${timeoutMs / 1000}s）`, durationMs: Date.now() - start });
    }, timeoutMs);
    worker.on("message", (msg: { ok: boolean; result?: unknown; error?: string }) => {
      clearTimeout(timer);
      worker.terminate();
      const durationMs = Date.now() - start;
      if (!msg.ok) return resolve({ ok: false, error: msg.error ?? "JS 工具执行失败", durationMs });
      // 用户代码返回 AgentToolResult { content: [{type:"text", text}] } 或纯字符串/对象
      const r = msg.result;
      let output: string;
      if (r && typeof r === "object" && "content" in (r as Record<string, unknown>)) {
        const content = (r as { content: unknown }).content;
        output = Array.isArray(content)
          ? content.map((c) => (c && typeof c === "object" && "text" in c ? String((c as { text: unknown }).text) : String(c))).join("")
          : String(content);
      } else {
        output = typeof r === "string" ? r : JSON.stringify(r);
      }
      resolve({ ok: true, output, durationMs });
    });
    worker.on("error", (e: unknown) => {
      clearTimeout(timer);
      const msg = e instanceof Error ? e.message : String(e);
      resolve({ ok: false, error: msg ?? "JS worker 异常", durationMs: Date.now() - start });
    });
  });
}

// ===== 递归深度防护：llm 工具可调其他自定义工具，需防 A↔B / 自调用无限递归 =====
// 单线程 + 同步增减，无竞态。agentic 循环的 maxIterations 限制每层广度，这里限制嵌套深度。
const MAX_NESTING_PER_TOOL = 3; // 同名工具最多嵌套 3 层
const MAX_TOTAL_NESTING = 12; // 所有自定义工具总嵌套深度上限
const activePerTool = new Map<string, number>();
let totalActive = 0;

/** dispatch：按 CustomToolKind 跑一次工具（不捕获异常，由调用方包装成 AgentToolResult）。 */
export async function runCustomToolKind(
  def: CustomToolDef,
  params: Record<string, unknown>,
  ctx: ToolRunCtx,
): Promise<ToolRunResult> {
  const depth = activePerTool.get(def.name) ?? 0;
  if (depth >= MAX_NESTING_PER_TOOL) {
    return { ok: false, error: `工具「${def.name}」嵌套调用超过 ${MAX_NESTING_PER_TOOL} 层（防递归），已中止` };
  }
  if (totalActive >= MAX_TOTAL_NESTING) {
    return { ok: false, error: `自定义工具总嵌套深度超过 ${MAX_TOTAL_NESTING}（防递归），已中止` };
  }
  activePerTool.set(def.name, depth + 1);
  totalActive += 1;
  try {
    switch (def.kind.kind) {
      case "llm":
        return await runLlmTool(def.kind, params, ctx);
      case "http":
        return await runHttpTool(def.kind, params);
      case "js":
        return await runJsTool(def.kind, params, ctx, def.tier);
      default:
        return { ok: false, error: `未知工具种类: ${(def.kind as { kind: string }).kind}` };
    }
  } finally {
    activePerTool.set(def.name, depth);
    totalActive -= 1;
  }
}
