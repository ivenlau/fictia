import { type Model, type Message, type AssistantMessage } from "@earendil-works/pi-ai";
import { novelService } from "../services/novel.service.js";
import { chapterService } from "../services/chapter.service.js";
import { fileService } from "../services/file.service.js";
import { runAgentSession } from "./agent-runner.js";
import { MEMORY_PATH } from "@fictia/shared";
import { toolRegistry, CHAT_TOOLS, type ToolContext } from "../tools/index.js";
import { customToolService } from "../services/custom-tool-service.js";

export interface ChatToolCall {
  tool: string;
  input: string;
  result: string;
}

export interface ChatAgentCallbacks {
  onDelta: (text: string) => void;
  onToolCall: (tool: string, input: string) => void;
  onToolResult: (tool: string, input: string, result: string) => void;
  /** 工具确认（manualConfirm 开启时由 route 提供）。返回 true 批准、false 拒绝。 */
  onConfirmTool?: (tool: string, input: string) => Promise<boolean>;
}

/**
 * create_novel 引导流程（多步收集信息）。
 * 原生 function calling 下工具签名自动暴露给模型，无需手工拼工具描述；
 * 此处只保留对话引导（何时建书、分步询问、确认后调用）。
 */
function buildWorkStyleGuide(): string {
  return `## 工作方式
处理复杂或多步骤任务时（如重写整章、跨章一致性核对、批量修改设定），可主动调用 \`todo\` 工具规划任务并逐步推进——先把任务拆解为可执行步骤，逐步执行、核验，一时刻只留一个进行中项。简单问答无需使用。`;
}

function buildCreateNovelGuide(): string {
  return `## 创建小说引导流程
当用户想要创建新小说时，按以下步骤引导收集信息：
1. 先询问小说标题和类型（玄幻、科幻、言情、悬疑、历史、都市、仙侠、末日等）
2. 询问故事简介（帮助用户优化描述，使其更精炼吸引人）
3. 询问目标章节数（给出建议：短篇10-15章、中篇20-30章、长篇50章以上）
4. 询问标签（帮助用户提炼3-5个关键词标签）
5. 整理所有信息展示给用户确认，格式清晰列出每一项
6. 用户明确确认后调用 create_novel 工具创建小说
注意：每一步只问一个方面，不要一次性问所有问题。根据用户的回答给出优化建议。
create_novel 工具调用成功后，告知用户小说已创建，并提示用户点击左侧资源管理器的刷新按钮查看新建的小说。`;
}

async function buildNovelContext(novelId: string): Promise<string> {
  const novel = novelService.getById(novelId);
  if (!novel) return "";

  const files = await novelService.getWorkspaceFiles(novelId);
  const chapters = await chapterService.listByNovel(novelId);

  const fileList = files.map((f) => `  - ${f.path} (${f.type})`).join("\n");
  const chapterList = chapters
    .map((ch) => `  - 第${ch.number}章: ${ch.title ?? "无标题"} [${ch.status}] ${ch.wordCount}字`)
    .join("\n");

  // Load memory file if exists
  const memoryFile = files.find((f) => f.path === MEMORY_PATH);
  const memorySection = memoryFile?.content
    ? `\n\n## 记忆\n以下是之前对话中保存的重要信息：\n${memoryFile.content}`
    : "";

  return `\n\n## 当前小说信息
标题：${novel.title}
类型：${novel.genre}
简介：${novel.description}
状态：${novel.status}
目标章节数：${novel.targetChapters}

## 工作区文件
${fileList || "（暂无文件）"}

## 章节列表
${chapterList || "（暂无章节）"}${memorySection}`;
}

function stringifyInput(input: unknown): string {
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

/**
 * 运行 chat 助手：原生 function calling（经 agent-runner）+ 流式 token。
 * 替代原文本标签伪协议（<<tool:x>>{json}<</tool>>）。SSE 事件格式不变
 * （text_delta / tool_call / tool_result / done / error），前端 useChatStream 无需改。
 */
export async function runChatAgent(
  model: Model<"openai-completions">,
  apiKey: string,
  persona: string,
  userMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  novelId: string | null,
  callbacks: ChatAgentCallbacks,
): Promise<string> {
  const novelContext = novelId ? await buildNovelContext(novelId) : "";
  const systemPrompt = `${persona}\n\n${buildWorkStyleGuide()}\n\n${buildCreateNovelGuide()}${novelContext}`;

  // 构造 messages：history（assistant 需转成 AssistantMessage 格式）+ 当前 user
  const messages: Message[] = [];
  for (const msg of history) {
    if (msg.role === "user") {
      messages.push({ role: "user", content: msg.content, timestamp: Date.now() });
    } else {
      messages.push({
        role: "assistant",
        content: [{ type: "text", text: msg.content }],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "stop",
        timestamp: Date.now(),
      } as AssistantMessage);
    }
  }
  messages.push({ role: "user", content: userMessage, timestamp: Date.now() });

  // 工具：有 novelId 给全量 chat 工具；无 novelId 只给 create_novel（建书不依赖 novelId）
  const ctx: ToolContext = {
    novelId: novelId ?? "",
    novelDir: novelId ? fileService.getNovelDir(novelId) : "",
  };
  // 工具：有 novelId 给全量 chat 工具 + 所有启用的自定义工具；无 novelId 只给 create_novel（建书不依赖 novelId）
  const toolNames = novelId ? [...CHAT_TOOLS, ...customToolService.enabledToolNames()] : ["create_novel"];
  const tools = toolRegistry.getTools(ctx, toolNames);

  const { text } = await runAgentSession({
    model,
    apiKey,
    systemPrompt,
    messages,
    tools,
    agentType: "chat",
    maxIterations: 5,
    onDelta: (delta) => callbacks.onDelta(delta),
    onToolCall: (name, input) => callbacks.onToolCall(name, stringifyInput(input)),
    onToolResult: (name, input, result) =>
      callbacks.onToolResult(name, stringifyInput(input), result),
    confirmTool: callbacks.onConfirmTool
      ? (name, input) => callbacks.onConfirmTool!(name, stringifyInput(input))
      : undefined,
  });

  return text;
}
