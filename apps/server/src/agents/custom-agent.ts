/**
 * 自定义 single-call 运行器（自定义流程用）。
 *
 * 不继承 BaseAgent、不进 AGENT_REGISTRY、不加 "custom" 到 AgentType 枚举（agent_outputs.agent_type
 * 是 text 列直接存 "custom"；trace.agentType 已是 string）。直接调 runAgentSession：
 * 纯用户 systemPrompt（不注入 craft/参考/style-guide）、指定模型、按名取工具（含自定义工具）。
 * 自动享有 runAgentSession 的 trace 增量构建、工具执行、filesWritten、todoSnapshot。
 */
import * as path from "path";
import { runAgentSession } from "./agent-runner.js";
import { providerService } from "../services/provider.service.js";
import { buildModel } from "../llm/providers.js";
import { toolRegistry } from "../tools/registry.js";
import { fileService } from "../services/file.service.js";
import type { AgentRunTrace, AgentModelAssignment } from "@fictia/shared";

export interface CustomCallOptions {
  novelDir: string;
  systemPrompt: string;
  input: string;
  /** 指定模型（providerId + modelId）。未指定抛错（调用方应给默认，如 systemModel）。 */
  model?: AgentModelAssignment;
  /** 工具名清单（内置 + 自定义）；空或省略表示无工具。 */
  tools?: string[];
  /** 最大工具迭代轮数，默认 20。 */
  maxIterations?: number;
  /** trace 落盘文件名（agent-outputs 下）；省略不落盘。 */
  traceFilename?: string;
}

export interface CustomCallResult {
  output: string;
  filesWritten: string[];
  success: boolean;
  trace: AgentRunTrace;
}

/**
 * 运行一次自定义 LLM 调用。跑到模型不再调工具或触达 maxIterations 为止。
 */
export async function runCustomCall(opts: CustomCallOptions): Promise<CustomCallResult> {
  if (!opts.model) {
    throw new Error("自定义调用未指定模型（请在流程中选一个 provider + model）。");
  }
  const resolved = providerService.resolveModel(opts.model.providerId, opts.model.modelId);
  if (!resolved) {
    throw new Error(
      `未找到模型 ${opts.model.providerId}/${opts.model.modelId}，请在设置中检查。`,
    );
  }
  const apiKey = resolved.provider.apiKey ?? "";
  if (!apiKey) {
    throw new Error(`未配置 API Key：${resolved.provider.name}，请在设置中填写。`);
  }

  const novelId = path.basename(opts.novelDir);
  const toolCtx = { novelId, novelDir: opts.novelDir };
  const tools =
    opts.tools && opts.tools.length > 0 ? toolRegistry.getTools(toolCtx, opts.tools) : [];

  // 串行化 trace 落盘（与 BaseAgent.runLLM 的 writeChain 一致，防并发写损坏）。
  let writeChain: Promise<void> = Promise.resolve();
  const traceFile = opts.traceFilename;
  const onTraceUpdate = traceFile
    ? (t: AgentRunTrace) => {
        writeChain = writeChain.then(() =>
          fileService
            .writeAgentTrace(novelId, traceFile, t)
            .catch((e) => console.error("[custom-call] trace write failed", e)),
        );
      }
    : undefined;

  try {
    const res = await runAgentSession({
      model: buildModel(resolved.provider, resolved.model),
      apiKey,
      systemPrompt: opts.systemPrompt,
      messages: [{ role: "user", content: opts.input, timestamp: Date.now() }],
      tools: tools.length > 0 ? tools : undefined,
      agentType: "custom",
      modelLabel: opts.model.modelId,
      providerLabel: opts.model.providerId,
      maxIterations: opts.maxIterations ?? 20,
      onTraceUpdate,
    });
    return {
      output: res.text,
      filesWritten: res.filesWritten,
      success: !!res.text,
      trace: res.trace,
    };
  } finally {
    await writeChain;
  }
}
