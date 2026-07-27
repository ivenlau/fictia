import type { AgentType, StageName, AgentModelAssignment } from "@fictia/shared";
import { STAGE_TO_AGENT } from "@fictia/shared";
import type { Model } from "@earendil-works/pi-ai";
import { getModelForAgent } from "../llm/models.js";
import type { BaseAgent, AgentRunResult, AgentRunOptions } from "./base-agent.js";

import { GenreAnalystAgent } from "./genre-analyst.js";
import { ArchitectAgent } from "./architect.js";
import { StyleDesignerAgent } from "./style-designer.js";
import { ArtDirectorAgent } from "./art-director.js";
import { NarrativeWeaverAgent } from "./narrative-weaver.js";
import { WorldBuilderAgent } from "./world-builder.js";
import { CharacterDesignerAgent } from "./character-designer.js";
import { StoryDesignerAgent } from "./story-designer.js";
import { ChapterWriterAgent } from "./chapter-writer.js";
import { EditorAgent } from "./editor.js";
import { ConsistencyCheckerAgent } from "./consistency-checker.js";

// 触发工具平台注册：注册所有工具工厂 + agent 工具清单（替代 BaseAgent.getToolTier）。
import "../tools/index.js";

type AgentConstructor = new (
  novelDir: string,
  model: Model<"openai-completions">,
  apiKey: string,
) => BaseAgent;

const AGENT_REGISTRY: Record<AgentType, AgentConstructor> = {
  "genre-analyst": GenreAnalystAgent,
  "architect": ArchitectAgent,
  "style-designer": StyleDesignerAgent,
  "art-director": ArtDirectorAgent,
  "narrative-weaver": NarrativeWeaverAgent,
  "world-builder": WorldBuilderAgent,
  "character-designer": CharacterDesignerAgent,
  "story-designer": StoryDesignerAgent,
  "chapter-writer": ChapterWriterAgent,
  "editor": EditorAgent,
  "consistency-checker": ConsistencyCheckerAgent,
};

type AgentModels = Partial<Record<AgentType, AgentModelAssignment>>;

/**
 * Create an agent instance for the given type. The model + api key are resolved
 * from the providers/models tables (see provider.service / getModelForAgent).
 */
export function createAgent(
  agentType: AgentType,
  novelDir: string,
  agentModels?: AgentModels,
): BaseAgent {
  const AgentClass = AGENT_REGISTRY[agentType];
  if (!AgentClass) {
    throw new Error(`Unknown agent type: ${agentType}`);
  }

  const { model, apiKey, modelId, providerId } = getModelForAgent(agentType, agentModels);
  const agent = new AgentClass(novelDir, model, apiKey);
  agent.modelId = modelId;
  agent.providerId = providerId;
  return agent;
}

/**
 * Run an agent by type with the given context.
 */
export async function runAgent(
  agentType: AgentType,
  novelDir: string,
  options?: AgentRunOptions,
  agentModels?: AgentModels,
): Promise<AgentRunResult> {
  const agent = createAgent(agentType, novelDir, agentModels);
  // 注入调试 trace sink（由 executeAgent 提供；rewrite 等不传则为空，不写 trace）
  if (options?.traceSink) agent.traceSink = options.traceSink;
  return agent.run(options);
}

/**
 * Create an agent from a stage name.
 */
export function createAgentFromStage(
  stageName: StageName,
  novelDir: string,
  agentModels?: AgentModels,
): BaseAgent {
  const agentType = STAGE_TO_AGENT[stageName];
  return createAgent(agentType, novelDir, agentModels);
}

export type { BaseAgent, AgentRunResult, AgentRunOptions };
