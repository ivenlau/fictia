import type { StageName, AgentType } from "@fictia/shared";
import { STAGE_TO_AGENT, STAGE_LABELS, STAGE_DEPENDENCIES, INCREMENTAL_STAGES } from "@fictia/shared";

export interface PipelineStage {
  name: StageName;
  label: string;
  agentType: AgentType;
  dependsOn: StageName[];
  autoTrigger?: boolean;
  canRunIncremental: boolean;
}

export const PIPELINE_DEFINITIONS: PipelineStage[] = [
  {
    name: "genre_analysis",
    label: STAGE_LABELS.genre_analysis,
    agentType: STAGE_TO_AGENT.genre_analysis,
    dependsOn: STAGE_DEPENDENCIES.genre_analysis,
    canRunIncremental: false,
  },
  {
    name: "architecture",
    label: STAGE_LABELS.architecture,
    agentType: STAGE_TO_AGENT.architecture,
    dependsOn: STAGE_DEPENDENCIES.architecture,
    canRunIncremental: false,
  },
  {
    name: "style",
    label: STAGE_LABELS.style,
    agentType: STAGE_TO_AGENT.style,
    dependsOn: STAGE_DEPENDENCIES.style,
    canRunIncremental: false,
  },
  {
    name: "art_design",
    label: STAGE_LABELS.art_design,
    agentType: STAGE_TO_AGENT.art_design,
    dependsOn: STAGE_DEPENDENCIES.art_design,
    canRunIncremental: false,
  },
  {
    name: "narrative_weave",
    label: STAGE_LABELS.narrative_weave,
    agentType: STAGE_TO_AGENT.narrative_weave,
    dependsOn: STAGE_DEPENDENCIES.narrative_weave,
    canRunIncremental: false,
  },
  {
    name: "world",
    label: STAGE_LABELS.world,
    agentType: STAGE_TO_AGENT.world,
    dependsOn: STAGE_DEPENDENCIES.world,
    canRunIncremental: true,
  },
  {
    name: "characters",
    label: STAGE_LABELS.characters,
    agentType: STAGE_TO_AGENT.characters,
    dependsOn: STAGE_DEPENDENCIES.characters,
    canRunIncremental: true,
  },
  {
    name: "story",
    label: STAGE_LABELS.story,
    agentType: STAGE_TO_AGENT.story,
    dependsOn: STAGE_DEPENDENCIES.story,
    canRunIncremental: true,
  },
  {
    name: "chapters",
    label: STAGE_LABELS.chapters,
    agentType: STAGE_TO_AGENT.chapters,
    dependsOn: STAGE_DEPENDENCIES.chapters,
    canRunIncremental: true,
  },
  {
    name: "editor",
    label: STAGE_LABELS.editor,
    agentType: STAGE_TO_AGENT.editor,
    dependsOn: STAGE_DEPENDENCIES.editor,
    autoTrigger: true,
    canRunIncremental: true,
  },
  {
    name: "consistency",
    label: STAGE_LABELS.consistency,
    agentType: STAGE_TO_AGENT.consistency,
    dependsOn: STAGE_DEPENDENCIES.consistency,
    canRunIncremental: true,
  },
];

export function getStageDefinition(name: StageName): PipelineStage | undefined {
  return PIPELINE_DEFINITIONS.find(d => d.name === name);
}
