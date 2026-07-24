/**
 * 工具平台类型定义。
 *
 * 统一 pipeline agents 与 chat 助手的工具协议：所有工具实现 AgentTool（pi-agent-core），
 * 额外带 tier（权限分层）和 tags（场景标签），由 ToolRegistry 集中注册、按 agent 分配。
 */
import type {
  AgentTool,
  AgentToolResult,
  AgentToolUpdateCallback,
} from "@earendil-works/pi-agent-core";
import type { TSchema } from "@earendil-works/pi-ai";

/**
 * 工具运行上下文。
 *
 * 两套 agent 操作同一批小说文件，但入口不同：
 * - pipeline agents（BaseAgent）持有 novelDir，直接文件 I/O；
 * - chat 助手持有 novelId，经 service 层解析到 novelDir。
 * 统一成同一份 ctx，同一套工具即可同时服务两套 agent。
 */
export interface ToolContext {
  novelId: string;
  novelDir: string;
}

/** 工具权限分层：只读查询 / 文件写入 / 编排（触发流水线/写作循环等，本次不实现）。 */
export type ToolTier = "readonly" | "write" | "orchestrate";

/**
 * Fictia 工具：AgentTool + 权限/场景元数据。
 * tier 用于按 agent 角色过滤可用工具；tags 供 UI/日志分组。
 *
 * 重新声明 execute：registry 存混合工具（泛型已擦除为 TSchema，Static<TSchema>=unknown），
 * 此处把 params 放宽为 any，使各工具可直接解构取参（运行时由 pi-agent-core 的
 * validateToolArguments 按 parameters schema 校验，类型安全不丢）。
 */
export interface FictiaTool<T extends TSchema = TSchema> extends AgentTool<T> {
  tier: ToolTier;
  tags?: string[];
  execute: (
    toolCallId: string,
    params: any,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback,
  ) => Promise<AgentToolResult<any>>;
}

/**
 * 工具工厂：按 ToolContext 生成一组工具实例。
 * 每个工具域（file/chapter/narrative-state/...）导出一个工厂，注册到 ToolRegistry。
 */
export type ToolFactory = (ctx: ToolContext) => FictiaTool[];
