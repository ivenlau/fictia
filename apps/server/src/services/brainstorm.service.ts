/**
 * 头脑风暴三段式（设计阶段 1-8）：探索 -> 共创 -> 产出。
 * 对齐 skill SKILL.md 的 brainstorm 模式。
 *
 * 后端提供 explore（产出 3-5 方向，不写文件）+ produce（按已确认方向产出最终文件）。
 * 共创段由用户多次调 explore（带 feedback directive）收敛，或走 chat。
 */

import { createAgent } from "../agents/index.js";
import { STAGE_TO_AGENT } from "@fictia/shared";
import type { StageName, AgentType, AgentModelAssignment } from "@fictia/shared";

type AgentModels = Partial<Record<AgentType, AgentModelAssignment>>;

const DESIGN_STAGES: StageName[] = [
  "genre_analysis",
  "architecture",
  "style",
  "art_design",
  "narrative_weave",
  "world",
  "characters",
  "story",
];

export function isDesignStage(stage: StageName): boolean {
  return DESIGN_STAGES.includes(stage);
}

function assertDesignStage(stage: StageName): void {
  if (!isDesignStage(stage)) {
    throw new Error(`阶段 ${stage} 不支持头脑风暴（仅设计阶段 1-8）`);
  }
}

export interface ExploreResult {
  stage: StageName;
  directions: string;
}

export async function exploreDirections(
  novelDir: string,
  stage: StageName,
  agentModels: AgentModels | undefined,
  directive?: string,
): Promise<ExploreResult> {
  assertDesignStage(stage);
  const agent = createAgent(STAGE_TO_AGENT[stage], novelDir, agentModels);
  const directions = await agent.runExplore(directive);
  return { stage, directions };
}

export interface ProduceResult {
  stage: StageName;
  output: string;
  filesWritten: string[];
}

export async function produceWithDirection(
  novelDir: string,
  stage: StageName,
  direction: string,
  agentModels: AgentModels | undefined,
): Promise<ProduceResult> {
  assertDesignStage(stage);
  const agent = createAgent(STAGE_TO_AGENT[stage], novelDir, agentModels);
  const result = await agent.run({
    userDirective: `按以下已确认的创意方向产出最终内容（严格遵循风格指南与设定）：\n\n${direction}`,
  });
  return { stage, output: result.output, filesWritten: result.filesWritten };
}
