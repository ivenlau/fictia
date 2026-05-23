import { create } from "zustand";
import type { StageName, StageStatus, AgentType } from "@fictia/shared";
import { STAGE_LABELS, STAGE_TO_AGENT, STAGE_DEPENDENCIES } from "@fictia/shared";

export interface StageState {
  name: StageName;
  label: string;
  agentType: AgentType;
  dependsOn: StageName[];
  canRunIncremental: boolean;
  status: StageStatus;
  reason?: string;
  confirmedAt?: string;
}

interface PipelineState {
  stages: StageState[];
  progress: {
    confirmed: number;
    total: number;
    percentage: number;
  };
  isRunning: boolean;
  currentStage: StageName | null;

  // Actions
  setStages: (stages: StageState[]) => void;
  updateStage: (stageName: StageName, updates: Partial<StageState>) => void;
  setProgress: (progress: { confirmed: number; total: number; percentage: number }) => void;
  setRunning: (running: boolean) => void;
  setCurrentStage: (stage: StageName | null) => void;
  reset: () => void;
}

const PIPELINE_STAGES: StageName[] = [
  "genre_analysis",
  "architecture",
  "style",
  "art_design",
  "narrative_weave",
  "world",
  "characters",
  "story",
  "chapters",
  "editor",
  "consistency",
];

const INCREMENTAL_STAGES: StageName[] = [
  "world",
  "characters",
  "story",
  "chapters",
  "editor",
  "consistency",
];

const defaultStages: StageState[] = PIPELINE_STAGES.map((name) => ({
  name,
  label: STAGE_LABELS[name],
  agentType: STAGE_TO_AGENT[name],
  dependsOn: STAGE_DEPENDENCIES[name] ?? [],
  canRunIncremental: INCREMENTAL_STAGES.includes(name),
  status: "not_started" as StageStatus,
}));

export const usePipelineStore = create<PipelineState>((set) => ({
  stages: defaultStages,
  progress: {
    confirmed: 0,
    total: PIPELINE_STAGES.length,
    percentage: 0,
  },
  isRunning: false,
  currentStage: null,

  setStages: (stages) => set({ stages }),

  updateStage: (stageName, updates) =>
    set((s) => ({
      stages: s.stages.map((stage) =>
        stage.name === stageName ? { ...stage, ...updates } : stage,
      ),
    })),

  setProgress: (progress) => set({ progress }),

  setRunning: (running) => set({ isRunning: running }),

  setCurrentStage: (stage) => set({ currentStage: stage }),

  reset: () =>
    set({
      stages: defaultStages,
      progress: {
        confirmed: 0,
        total: PIPELINE_STAGES.length,
        percentage: 0,
      },
      isRunning: false,
      currentStage: null,
    }),
}));
