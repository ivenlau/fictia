import { stream, type Model, type Context, type Message, type AssistantMessage } from "@earendil-works/pi-ai";
import { novelService } from "../services/novel.service.js";
import { chapterService } from "../services/chapter.service.js";
import { fileService } from "../services/file.service.js";

const MAX_TOOL_ITERATIONS = 5;

export interface ChatToolCall {
  tool: string;
  input: string;
  result: string;
}

export interface ChatAgentCallbacks {
  onDelta: (text: string) => void;
  onToolCall: (tool: string, input: string) => void;
  onToolResult: (tool: string, input: string, result: string) => void;
}

function buildToolDescription(): string {
  return `你可以使用以下工具来帮助用户。当你需要使用工具时，在回复中包含工具调用标签。

工具列表：
- read_file: 读取当前小说的工作区文件。格式：<<tool:read_file>>{"path":"文件路径"}<</tool>>
- write_file: 写入/更新工作区文件。格式：<<tool:write_file>>{"path":"文件路径","content":"文件内容"}<</tool>>
- edit_file: 精确编辑工作区文件（替换指定文本片段，而非重写整个文件）。格式：<<tool:edit_file>>{"path":"文件路径","edits":[{"oldText":"原文片段","newText":"替换文本"}]}<</tool>>
- list_files: 列出当前小说所有工作区文件。格式：<<tool:list_files>><</tool>>
- read_chapter: 读取指定章节内容。格式：<<tool:read_chapter>>{"number":章节号}<</tool>>
- edit_chapter: 精确编辑指定章节（替换指定文本片段）。格式：<<tool:edit_chapter>>{"number":章节号,"edits":[{"oldText":"原文片段","newText":"替换文本"}]}<</tool>>
- list_chapters: 列出当前小说所有章节。格式：<<tool:list_chapters>><</tool>>
- save_memory: 保存信息到记忆文件。格式：<<tool:save_memory>>{"content":"要保存的内容"}<</tool>>
- create_novel: 创建一本新小说。格式：<<tool:create_novel>>{"title":"标题","genre":"类型","description":"简介","targetChapters":28,"tags":["标签1","标签2"]}<</tool>>

工具调用规则：
1. 每次回复最多包含一个工具调用
2. 工具调用标签必须独占一行
3. 等待工具结果后再继续回复
4. 如果不需要工具，直接回复用户即可

创建小说引导流程：
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
  const memoryFile = files.find((f) => f.path === "AI助手/记忆.md");
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

const TOOL_OPEN_RE = new RegExp(String.raw`<<tool:(\w+)>>`);
const TOOL_CLOSE_TAG = String.raw`<</tool>>`;

function parseToolCall(text: string): { tool: string; input: string } | null {
  const openMatch = TOOL_OPEN_RE.exec(text);
  if (!openMatch) return null;
  const afterOpen = text.slice(openMatch.index + openMatch[0].length);
  const closeIdx = afterOpen.indexOf(TOOL_CLOSE_TAG);
  if (closeIdx === -1) return null;
  return { tool: openMatch[1], input: afterOpen.slice(0, closeIdx).trim() };
}

async function executeTool(
  tool: string,
  inputStr: string,
  novelId: string | null,
): Promise<string> {
  try {
    switch (tool) {
      case "read_file": {
        if (!novelId) return "错误：未指定小说，无法读取文件";
        const { path } = JSON.parse(inputStr);
        const file = await novelService.getWorkspaceFile(novelId, path);
        if (!file) return `错误：文件 "${path}" 不存在`;
        return `文件内容 (${path}):\n\`\`\`\n${file.content}\n\`\`\``;
      }

      case "write_file": {
        if (!novelId) return "错误：未指定小说，无法写入文件";
        const { path, content } = JSON.parse(inputStr);
        const existing = await novelService.getWorkspaceFile(novelId, path);
        if (existing) {
          await novelService.updateWorkspaceFile(novelId, path, content);
          return `已更新文件 "${path}"`;
        } else {
          await novelService.createWorkspaceFile(novelId, path, content);
          return `已创建文件 "${path}"`;
        }
      }

      case "edit_file": {
        if (!novelId) return "错误：未指定小说，无法编辑文件";
        const { path: editPath, edits } = JSON.parse(inputStr);
        if (!edits || !Array.isArray(edits) || edits.length === 0) {
          return "错误：edits 参数必须是非空数组，每个元素包含 oldText 和 newText";
        }
        const existingFile = await novelService.getWorkspaceFile(novelId, editPath);
        if (!existingFile) return `错误：文件 "${editPath}" 不存在，请先使用 write_file 创建`;
        let editedContent = existingFile.content;
        const appliedEdits: string[] = [];
        for (const edit of edits) {
          if (!edit.oldText || edit.newText === undefined) {
            return "错误：每个 edit 必须包含 oldText 和 newText";
          }
          if (!editedContent.includes(edit.oldText)) {
            return `错误：在文件中未找到匹配的文本: "${edit.oldText.slice(0, 50)}..."`;
          }
          editedContent = editedContent.replace(edit.oldText, edit.newText);
          appliedEdits.push(`"${edit.oldText.slice(0, 30)}..." → "${edit.newText.slice(0, 30)}..."`);
        }
        await novelService.updateWorkspaceFile(novelId, editPath, editedContent);
        return `已编辑文件 "${editPath}"，应用了 ${appliedEdits.length} 处修改：\n${appliedEdits.map((e, i) => `${i + 1}. ${e}`).join("\n")}`;
      }

      case "list_files": {
        if (!novelId) return "错误：未指定小说，无法列出文件";
        const files = await novelService.getWorkspaceFiles(novelId);
        if (files.length === 0) return "当前小说暂无工作区文件";
        return files.map((f) => `- ${f.path} (${f.type}, ${f.content?.length ?? 0}字符)`).join("\n");
      }

      case "read_chapter": {
        if (!novelId) return "错误：未指定小说，无法读取章节";
        const { number } = JSON.parse(inputStr);
        const chapters = await chapterService.listByNovel(novelId);
        const chapter = chapters.find((ch) => ch.number === number);
        if (!chapter) return `错误：第${number}章不存在`;
        if (!chapter.content) return `第${number}章 "${chapter.title ?? "无标题"}" 暂无内容（状态：${chapter.status}）`;
        return `第${number}章 "${chapter.title ?? "无标题"}" (${chapter.wordCount}字):\n\`\`\`\n${chapter.content}\n\`\`\``;
      }

      case "edit_chapter": {
        if (!novelId) return "错误：未指定小说，无法编辑章节";
        const { number: editNum, edits: chapterEdits } = JSON.parse(inputStr);
        if (!chapterEdits || !Array.isArray(chapterEdits) || chapterEdits.length === 0) {
          return "错误：edits 参数必须是非空数组";
        }
        const chapters = await chapterService.listByNovel(novelId);
        const targetChapter = chapters.find((ch) => ch.number === editNum);
        if (!targetChapter) return `错误：第${editNum}章不存在`;
        if (!targetChapter.content) return `错误：第${editNum}章暂无内容，无法编辑`;
        if (!targetChapter.filename) return `错误：第${editNum}章文件信息缺失`;

        let chapterEditedContent = targetChapter.content;
        const appliedChapterEdits: string[] = [];
        for (const edit of chapterEdits) {
          if (!edit.oldText || edit.newText === undefined) {
            return "错误：每个 edit 必须包含 oldText 和 newText";
          }
          if (!chapterEditedContent.includes(edit.oldText)) {
            return `错误：在第${editNum}章中未找到匹配的文本: "${edit.oldText.slice(0, 50)}..."`;
          }
          chapterEditedContent = chapterEditedContent.replace(edit.oldText, edit.newText);
          appliedChapterEdits.push(`"${edit.oldText.slice(0, 30)}..." → "${edit.newText.slice(0, 30)}..."`);
        }

        await chapterService.update(targetChapter.id, { content: chapterEditedContent });
        return `已编辑第${editNum}章，应用了 ${appliedChapterEdits.length} 处修改：\n${appliedChapterEdits.map((e, i) => `${i + 1}. ${e}`).join("\n")}`;
      }

      case "list_chapters": {
        if (!novelId) return "错误：未指定小说，无法列出章节";
        const chapters = await chapterService.listByNovel(novelId);
        if (chapters.length === 0) return "当前小说暂无章节";
        return chapters
          .map((ch) => `- 第${ch.number}章: ${ch.title ?? "无标题"} [${ch.status}] ${ch.wordCount}字${ch.summary ? `\n  摘要: ${ch.summary}` : ""}`)
          .join("\n");
      }

      case "create_novel": {
        const { title, genre, description, targetChapters, tags } = JSON.parse(inputStr);
        if (!title) return "错误：小说标题不能为空";
        const novel = await novelService.create({
          title,
          genre: genre ?? "",
          description: description ?? "",
          targetChapters: targetChapters ?? 28,
          tags: tags ?? [],
        });
        return `小说创建成功！\nID: ${novel.id}\n标题: ${novel.title}\n类型: ${novel.genre}\n简介: ${novel.description}\n目标章节数: ${novel.targetChapters}\n标签: ${novel.tags.join(", ")}`;
      }

      case "save_memory": {
        if (!novelId) return "错误：未指定小说，无法保存记忆";
        const { content } = JSON.parse(inputStr);
        const memoryPath = "AI助手/记忆.md";
        const existing = await novelService.getWorkspaceFile(novelId, memoryPath);
        const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
        const newEntry = `\n\n## ${timestamp}\n${content}`;
        if (existing) {
          await novelService.updateWorkspaceFile(novelId, memoryPath, existing.content + newEntry);
        } else {
          await novelService.createWorkspaceFile(novelId, memoryPath, `# AI助手记忆\n${newEntry}`);
        }
        return "已保存到记忆文件";
      }

      default:
        return `错误：未知工具 "${tool}"`;
    }
  } catch (e: any) {
    return `工具执行错误: ${e.message}`;
  }
}

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
  const toolDescription = buildToolDescription();

  const systemPrompt = `${persona}

${toolDescription}${novelContext}`;

  // Build messages array with proper types for pi-ai
  const messages: Message[] = [];

  for (const msg of history) {
    if (msg.role === "user") {
      messages.push({ role: "user", content: msg.content, timestamp: Date.now() });
    } else {
      // Assistant messages must use content array format with TextContent blocks
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

  const allToolCalls: ChatToolCall[] = [];
  let fullResponse = "";

  // Agentic loop
  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const context: Context = {
      systemPrompt,
      messages,
    };

    const eventStream = stream(model, context, { apiKey });
    let iterationText = "";

    for await (const event of eventStream) {
      if (event.type === "text_delta") {
        iterationText += event.delta;
        callbacks.onDelta(event.delta);
      } else if (event.type === "error") {
        throw new Error(`LLM error: ${event.error?.errorMessage ?? "Unknown error"}`);
      }
    }

    fullResponse += iterationText;

    // Check for tool call in this iteration's response
    const toolCall = parseToolCall(iterationText);
    if (!toolCall) {
      // No tool call — this is the final response
      break;
    }

    // Execute the tool
    callbacks.onToolCall(toolCall.tool, toolCall.input);
    const toolResult = await executeTool(toolCall.tool, toolCall.input, novelId);
    callbacks.onToolResult(toolCall.tool, toolCall.input, toolResult);

    allToolCalls.push({ tool: toolCall.tool, input: toolCall.input, result: toolResult });

    // Remove the tool call tags from the response and add tool result to messages
    const cleanText = iterationText.replace(new RegExp(String.raw`<<tool:\w+>>[\s\S]*?${TOOL_CLOSE_TAG}`), "").trim();

    // Add assistant message with tool call context, then tool result
    messages.push({
      role: "assistant",
      content: [{ type: "text", text: cleanText ? `${cleanText}\n\n[使用了工具: ${toolCall.tool}]` : `[使用了工具: ${toolCall.tool}]` }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop",
      timestamp: Date.now(),
    } as AssistantMessage);
    messages.push({
      role: "user",
      content: `工具 ${toolCall.tool} 的执行结果：\n${toolResult}`,
      timestamp: Date.now(),
    });
  }

  return fullResponse;
}
