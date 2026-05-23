import { stream, type Model, type Context, type Message, type AssistantMessage } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { v4 as uuid } from "uuid";

export interface ToolCallResult {
  tool: string;
  input: string;
  result: string;
}

export interface ToolAgentCallbacks {
  onDelta?: (text: string) => void;
  onToolCall?: (tool: string, input: string) => void;
  onToolResult?: (tool: string, input: string, result: string) => void;
}

/**
 * 支持工具调用的 Agent
 *
 * 可以使用 pi-coding-agent 提供的文件操作工具（read, edit, write 等）
 */
export class ToolAgent {
  private model: Model<"openai-completions">;
  private systemPrompt: string;
  private apiKey: string;
  private tools: AgentTool[];
  private maxIterations: number;

  constructor(
    model: Model<"openai-completions">,
    systemPrompt: string,
    apiKey: string,
    tools: AgentTool[],
    maxIterations: number = 10,
  ) {
    this.model = model;
    this.systemPrompt = systemPrompt;
    this.apiKey = apiKey;
    this.tools = tools;
    this.maxIterations = maxIterations;
  }

  private buildToolDescription(): string {
    if (this.tools.length === 0) return "";

    const toolDescs = this.tools.map((t) => {
      const params = t.parameters ? JSON.stringify(t.parameters, null, 2) : "无参数";
      return `### ${t.name}
${t.description}

参数格式：
\`\`\`json
${params}
\`\`\``;
    }).join("\n\n");

    return `## 可用工具

你可以使用以下工具来完成任务。当你需要使用工具时，在回复中包含工具调用标签。

${toolDescs}

### 工具调用格式
<<tool:工具名>>{"参数":"值"}<</tool>>

### 规则
1. 每次回复最多包含一个工具调用
2. 工具调用标签必须独占一行
3. 等待工具结果后再继续回复
4. 如果不需要工具，直接回复即可`;
  }

  async run(userMessage: string, callbacks?: ToolAgentCallbacks): Promise<{ response: string; toolCalls: ToolCallResult[] }> {
    const toolDescription = this.buildToolDescription();
    const systemPrompt = toolDescription
      ? `${this.systemPrompt}\n\n${toolDescription}`
      : this.systemPrompt;

    const messages: Message[] = [
      { role: "user", content: userMessage, timestamp: Date.now() },
    ];

    const allToolCalls: ToolCallResult[] = [];
    let fullResponse = "";

    const TOOL_OPEN_RE = /<<tool:(\w+)>>/;
    const TOOL_CLOSE_TAG = "<</tool>>";

    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      const context: Context = {
        systemPrompt,
        messages,
      };

      const eventStream = stream(this.model, context, { apiKey: this.apiKey });
      let iterationText = "";

      for await (const event of eventStream) {
        if (event.type === "text_delta") {
          iterationText += event.delta;
          callbacks?.onDelta?.(event.delta);
        } else if (event.type === "error") {
          throw new Error(`LLM error: ${event.error?.errorMessage ?? "Unknown error"}`);
        }
      }

      fullResponse += iterationText;

      // 检查是否有工具调用
      const openMatch = TOOL_OPEN_RE.exec(iterationText);
      if (!openMatch) {
        break;
      }

      // 解析工具调用
      const afterOpen = iterationText.slice(openMatch.index + openMatch[0].length);
      const closeIdx = afterOpen.indexOf(TOOL_CLOSE_TAG);
      if (closeIdx === -1) {
        break;
      }

      const toolName = openMatch[1];
      const toolInput = afterOpen.slice(0, closeIdx).trim();

      callbacks?.onToolCall?.(toolName, toolInput);

      // 执行工具
      const tool = this.tools.find((t) => t.name === toolName);
      let toolResult: string;

      if (tool) {
        try {
          const input = JSON.parse(toolInput);
          const result = await tool.execute(uuid(), input);
          // 提取文本结果
          toolResult = result.content
            ?.filter((b: any) => b.type === "text")
            .map((b: any) => b.text)
            .join("\n") ?? "工具执行完成";
        } catch (e: any) {
          toolResult = `工具执行错误: ${e.message}`;
        }
      } else {
        toolResult = `错误：未知工具 "${toolName}"`;
      }

      callbacks?.onToolResult?.(toolName, toolInput, toolResult);
      allToolCalls.push({ tool: toolName, input: toolInput, result: toolResult });

      // 清理文本，移除工具调用标签
      const cleanText = iterationText
        .replace(new RegExp(`<<tool:\\w+>>[\\s\\S]*?${TOOL_CLOSE_TAG}`), "")
        .trim();

      // 添加助手消息和工具结果到对话
      messages.push({
        role: "assistant",
        content: [{ type: "text", text: cleanText || `[使用了工具: ${toolName}]` }],
        api: this.model.api,
        provider: this.model.provider,
        model: this.model.id,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "stop",
        timestamp: Date.now(),
      } as AssistantMessage);

      messages.push({
        role: "user",
        content: `工具 ${toolName} 的执行结果：\n${toolResult}`,
        timestamp: Date.now(),
      });
    }

    return { response: fullResponse, toolCalls: allToolCalls };
  }
}
