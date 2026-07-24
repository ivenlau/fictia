/**
 * 统一的 agent 运行器：封装 pi-agent-core 的 runAgentLoop。
 *
 * 替代两套手写工具循环：
 * - BaseAgent.runLLM（complete() + 手写工具循环，非流式）
 * - runChatAgent（stream() + 文本标签伪协议，流式）
 *
 * 统一为：原生 function calling（tools 进 Context.tools）+ 自动工具执行/回填/多轮，
 * 同时通过 emit 钩子暴露流式 token（chat SSE 用）和工具调用审计。
 *
 * 设计要点：
 * - convertToLlm：标准 user/assistant/toolResult 透传，过滤其余（与 pi-agent-core Agent 默认实现一致）。
 * - toolExecution: "sequential"：写工具不并行，避免文件竞态。
 * - shouldStopAfterTurn：闭包计数实现 maxIterations 兜底。
 * - afterToolCall：收集 filesWritten + 触发 onToolResult 回调。
 * - emit：message_update.text_delta -> onDelta；tool_execution_start -> onToolCall。
 */
import { runAgentLoop } from "@earendil-works/pi-agent-core";
import type {
  AgentContext,
  AgentEvent,
  AgentLoopConfig,
  AgentMessage,
  AgentTool,
  AfterToolCallContext,
} from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Message, Model, TextContent } from "@earendil-works/pi-ai";

export interface AgentRunnerOptions {
  model: Model<"openai-completions">;
  apiKey: string;
  systemPrompt: string;
  /** 初始消息（通常一条 user；chat 场景含 history + 当前 user）。 */
  messages: Message[];
  tools: AgentTool[] | undefined;
  /** 最大工具迭代轮数（assistant turn 数）。默认 20。0 表示不限制。 */
  maxIterations?: number;
  signal?: AbortSignal;
  /** 流式 token 回调（chat SSE text_delta）。 */
  onDelta?: (text: string) => void;
  /** 工具开始执行回调（审计/UI）。 */
  onToolCall?: (name: string, input: unknown) => void;
  /** 工具执行结束回调。result 为提取后的文本。 */
  onToolResult?: (name: string, input: unknown, result: string, isError: boolean) => void;
}

export interface AgentRunnerToolCall {
  name: string;
  input: unknown;
  result: string;
  isError: boolean;
}

export interface AgentRunnerResult {
  /** 累加所有 assistant turn 的文本（与原 runLLM/runChatAgent 行为一致）。 */
  text: string;
  /** 写类工具触及的文件/章节标识（path 或章节号字符串）。 */
  filesWritten: string[];
  toolCalls: AgentRunnerToolCall[];
}

/** 会产生文件副作用的工具。filesWritten 收集它们的入参标识。 */
const WRITE_TOOLS = new Set(["write_file", "edit_file", "edit_chapter", "save_memory"]);

/** 从 content blocks 提取纯文本。 */
function extractText(content: { type: string; text?: string }[] | undefined): string {
  if (!content) return "";
  return content
    .filter((b): b is TextContent => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
}

/** 累加所有 assistant turn 的文本，并捕获最后一个 errorMessage。 */
function collectAssistantText(
  messages: AgentMessage[],
): { text: string; errorMessage?: string } {
  let text = "";
  let errorMessage: string | undefined;
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    const am = m as AssistantMessage;
    if (am.errorMessage) errorMessage = am.errorMessage;
    text += extractText(am.content as { type: string; text?: string }[]);
  }
  return { text, errorMessage };
}

/**
 * 运行一个 agent 会话：跑到模型不再调用工具（或触达 maxIterations）为止。
 * 抛出异常表示 LLM 错误或空输出（与原 runLLM 行为一致）。
 */
export async function runAgentSession(opts: AgentRunnerOptions): Promise<AgentRunnerResult> {
  const maxIterations = opts.maxIterations ?? 20;
  const filesWritten: string[] = [];
  const toolCalls: AgentRunnerToolCall[] = [];
  let turnCount = 0;

  const convertToLlm = (msgs: AgentMessage[]): Message[] =>
    msgs.filter(
      (m): m is Message =>
        m.role === "user" || m.role === "assistant" || m.role === "toolResult",
    );

  const context: AgentContext = {
    systemPrompt: opts.systemPrompt,
    messages: [],
    tools: opts.tools,
  };

  const config: AgentLoopConfig = {
    model: opts.model,
    apiKey: opts.apiKey,
    convertToLlm,
    // 写工具串行，避免并行写同一文件竞态；只读工具串行也安全（量小）。
    toolExecution: "sequential",
    shouldStopAfterTurn: () => {
      turnCount += 1;
      return maxIterations > 0 && turnCount >= maxIterations;
    },
    afterToolCall: async (ctx: AfterToolCallContext) => {
      const name = ctx.toolCall.name;
      const input = ctx.args as Record<string, unknown> | undefined;
      if (WRITE_TOOLS.has(name) && input) {
        const p =
          (input.path as string | undefined) ??
          (input.file_path as string | undefined) ??
          (input.number !== undefined ? `chapter:${input.number}` : undefined);
        if (p) filesWritten.push(p);
      }
      const resultText = extractText(
        ctx.result?.content as { type: string; text?: string }[] | undefined,
      );
      const isError = !!ctx.isError;
      toolCalls.push({ name, input, result: resultText, isError });
      opts.onToolResult?.(name, input, resultText, isError);
      return undefined;
    },
  };

  const emit = (event: AgentEvent) => {
    switch (event.type) {
      case "message_update": {
        const e = event.assistantMessageEvent;
        if (e.type === "text_delta" && e.delta) opts.onDelta?.(e.delta);
        break;
      }
      case "tool_execution_start":
        opts.onToolCall?.(event.toolName, event.args);
        break;
    }
  };

  const finalMessages = await runAgentLoop(
    opts.messages as AgentMessage[],
    context,
    config,
    emit,
    opts.signal,
  );

  const { text, errorMessage } = collectAssistantText(finalMessages);
  if (!text) {
    if (errorMessage) throw new Error(`LLM error: ${errorMessage}`);
    throw new Error("Agent returned empty content");
  }

  return { text, filesWritten, toolCalls };
}
