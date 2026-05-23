import type { AgentType, StageName } from "@fictia/shared";
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

/**
 * Create an agent instance for the given type.
 */
export function createAgent(
  agentType: AgentType,
  novelDir: string,
  apiKeys: Record<string, string>,
  agentModels?: Record<AgentType, { provider: string; model: string }>,
): BaseAgent {
  const AgentClass = AGENT_REGISTRY[agentType];
  if (!AgentClass) {
    throw new Error(`Unknown agent type: ${agentType}`);
  }

  const { model, apiKey } = getModelForAgent(agentType, apiKeys, agentModels);

  return new AgentClass(novelDir, model, apiKey);
}

/**
 * Run an agent by type with the given context.
 */
export async function runAgent(
  agentType: AgentType,
  novelDir: string,
  apiKeys: Record<string, string>,
  options?: AgentRunOptions,
  agentModels?: Record<AgentType, { provider: string; model: string }>,
): Promise<AgentRunResult> {
  const agent = createAgent(agentType, novelDir, apiKeys, agentModels);
  return agent.run(options);
}

/**
 * Create an agent from a stage name.
 */
export function createAgentFromStage(
  stageName: StageName,
  novelDir: string,
  apiKeys: Record<string, string>,
  agentModels?: Record<AgentType, { provider: string; model: string }>,
): BaseAgent {
  const agentType = STAGE_TO_AGENT[stageName];
  return createAgent(agentType, novelDir, apiKeys, agentModels);
}

export type { BaseAgent, AgentRunResult, AgentRunOptions };
