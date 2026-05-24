import { create } from "zustand";
import type { StageName, StageStatus, AgentType } from "@fictia/shared";
import { STAGE_LABELS, STAGE_TO_AGENT, STAGE_DEPENDENCIES } from "@fictia/shared";
import type { PipelineStatus } from "@/api/pipelines";

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
  isPaused: boolean;
  currentStage: StageName | null;

  // Actions
  setStages: (stages: StageState[]) => void;
  updateStage: (stageName: StageName, updates: Partial<StageState>) => void;
  setProgress: (progress: { confirmed: number; total: number; percentage: number }) => void;
  setRunning: (running: boolean) => void;
  setPaused: (paused: boolean) => void;
  setCurrentStage: (stage: StageName | null) => void;
  loadFromStatus: (status: PipelineStatus) => void;
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

export function isStageEnabled(stage: StageState, allStages: StageState[]): boolean {
  if (stage.status === "in_progress") return false;
  return stage.dependsOn.every((depName) => {
    const dep = allStages.find((s) => s.name === depName);
    return dep?.status === "confirmed";
  });
}

export const usePipelineStore = create<PipelineState>((set) => ({
  stages: defaultStages,
  progress: {
    confirmed: 0,
    total: PIPELINE_STAGES.length,
    percentage: 0,
  },
  isRunning: false,
  isPaused: false,
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

  setPaused: (paused) => set({ isPaused: paused }),

  setCurrentStage: (stage) => set({ currentStage: stage }),

  loadFromStatus: (status) =>
    set({
      stages: status.stages,
      progress: status.progress,
      isRunning: status.isRunning,
      isPaused: status.isPaused,
      currentStage:
        status.stages.find((s) => s.status === "in_progress")?.name ?? null,
    }),

  reset: () =>
    set({
      stages: defaultStages,
      progress: {
        confirmed: 0,
        total: PIPELINE_STAGES.length,
        percentage: 0,
      },
      isRunning: false,
      isPaused: false,
      currentStage: null,
    }),
}));
