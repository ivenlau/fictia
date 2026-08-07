/**
 * 用户自定义工具的可序列化类型（前后端共享）。
 *
 * 工具 = name + description + parameters(JSON Schema) + execute。前三项是纯数据（UI 可编辑），
 * execute 的逻辑由 kind 决定：
 * - llm：工具执行 = 一次带自定义子提示词的 LLM 调用（零代码，最贴合写作场景）。
 * - http：工具执行 = HTTP 请求模板 + 响应提取（纯配置，接外部 API）。
 * - js：工具执行 = 用户写的 JS 函数，在 worker 里跑（最强表达力，超时隔离）。
 *
 * 工具定义存 DB（custom_tools 表），server 启动时经 createCustomTools 工厂注册到 ToolRegistry，
 * 任意流程可按名选用。原始 JSON Schema 经 typebox Type.Unsafe 适配为 TSchema，直接喂 LLM function calling。
 */
import type { AgentModelAssignment } from "./types.js";

/** 工具权限分层（与 server tools/types.ts 的 ToolTier 保持一致）。 */
export type ToolTier = "readonly" | "write" | "orchestrate";

/** 标准 JSON Schema 对象（用户在 UI / 生成器里定义）。 */
export type JsonSchema = {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
};

/** HTTP 方法。 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** 工具执行逻辑的种类。 */
export type CustomToolKind =
  | {
      kind: "llm";
      /** 子代理系统提示词（纯自定义，不走 BaseAgent 的 craft/参考注入）。 */
      systemPrompt: string;
      /** user message 模板，支持 {{paramName}} 插值工具入参。 */
      inputTemplate: string;
      /** 指定模型；省略用全局 systemModel。 */
      model?: AgentModelAssignment;
      /** 子代理可调用的工具名清单（内置系统工具 + 其他自定义工具）；空/省略=纯单次调用（无 agentic 循环）。 */
      tools?: string[];
      /** 子代理最大工具迭代轮数，默认 20（防 agentic 循环跑飞）。 */
      maxIterations?: number;
    }
  | {
      kind: "http";
      method: HttpMethod;
      /** URL 模板，支持 {{param}} 插值。 */
      urlTemplate: string;
      /** 请求头（值支持 {{param}} 插值）。 */
      headers?: Record<string, string>;
      /** body 模板（JSON 字符串，支持 {{param}} 插值）。 */
      bodyTemplate?: string;
      /** 响应提取：jsonpath（如 "data.result"）或正则；省略取响应全文。 */
      responseExtract?: string;
    }
  | {
      kind: "js";
      /**
       * 用户 JS 代码，在 worker_threads 里执行。注入 { params, novelId, novelDir, helpers }。
       * 代码须 return 一个 { content: [{type:"text", text:"..."}] } 形状（AgentToolResult）。
       * helpers 白名单：readFile/writeFile/listFiles/semanticSearch/fetch/log（按 tier 收敛）。
       */
      code: string;
    };

/** 自定义工具完整定义（DB 行的可序列化形态）。 */
export interface CustomToolDef {
  id: string;
  /** 唯一合法工具名 ^[a-z][a-z0-9_]*$，不与内置工具重名。 */
  name: string;
  label: string;
  /** 给 LLM 看的工具说明。 */
  description: string;
  tier: ToolTier;
  /** 参数 JSON Schema（LLM function calling 直接用）。 */
  parameters: JsonSchema;
  kind: CustomToolKind;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 工具生成 agent 的请求 / 响应（POST /custom-tools/generate）。 */
export interface GenerateToolRequest {
  /** 用户的自然语言描述。 */
  description: string;
  /** 可选：倾向生成的种类。 */
  preferKind?: CustomToolKind["kind"];
}

/** 工具测试请求（POST /custom-tools/:id/test 或临时持 def 测试）。 */
export interface TestToolRequest {
  /** 示例入参（按 parameters schema）。 */
  params: Record<string, unknown>;
}

export interface TestToolResult {
  ok: boolean;
  /** 工具返回的文本。 */
  output?: string;
  /** 错误信息（超时 / 异常 / HTTP 错误等）。 */
  error?: string;
  /** 耗时 ms。 */
  durationMs?: number;
}
