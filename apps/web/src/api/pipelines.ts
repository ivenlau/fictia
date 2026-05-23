import { api } from "./client";
import type { StageName, StageStatus, AgentType } from "@fictia/shared";

export interface PipelineStageInfo {
  name: StageName;
  label: string;
  agentType: AgentType;
  dependsOn: StageName[];
  canRunIncremental: boolean;
  status: StageStatus;
  reason?: string;
  confirmedAt?: string;
}

export interface PipelineStatus {
  novelId: string;
  progress: {
    confirmed: number;
    total: number;
    percentage: number;
  };
  stages: PipelineStageInfo[];
}

export interface StageRunResult {
  status: "completed" | "failed";
  stage: StageName;
  result: {
    output: string;
    filesWritten: string[];
    success: boolean;
    error?: string;
  };
}

export const pipelinesApi = {
  /**
   * Get pipeline status for a novel
   */
  getStatus: (novelId: string) =>
    api.get<PipelineStatus>(`/novels/${novelId}/pipeline/status`),

  /**
   * Start pipeline from first pending stage
   */
  start: (novelId: string) =>
    api.post<StageRunResult | { status: "complete"; message: string }>(
      `/novels/${novelId}/pipeline/start`,
    ),

  /**
   * Run a specific stage
   */
  runStage: (
    novelId: string,
    stage: StageName,
    options?: {
      userDirective?: string;
      isRedo?: boolean;
      incrementalTarget?: string;
    },
  ) =>
    api.post<StageRunResult>(
      `/novels/${novelId}/pipeline/stages/${stage}`,
      options,
    ),

  /**
   * Confirm a stage's output
   */
  confirmStage: (novelId: string, stage: StageName) =>
    api.post<{
      status: "confirmed";
      stage: StageName;
      hasMoreWork: boolean;
      message: string;
    }>(`/novels/${novelId}/pipeline/stages/${stage}/confirm`),

  /**
   * Modify a stage's output and propagate changes
   */
  modifyStage: (novelId: string, stage: StageName, content?: string) =>
    api.post<{
      status: "modified";
      stage: StageName;
      affectedStages: StageName[];
      message: string;
    }>(`/novels/${novelId}/pipeline/stages/${stage}/modify`, { content }),

  /**
   * Get stage output content
   */
  getStageOutput: (novelId: string, stage: StageName) =>
    api.get<{
      stage: StageName;
      label: string;
      content: string;
      hasContent: boolean;
    }>(`/novels/${novelId}/pipeline/stages/${stage}/output`),

  /**
   * Reset pipeline state
   */
  reset: (novelId: string) =>
    api.post<{ status: "reset"; message: string }>(
      `/novels/${novelId}/pipeline/reset`,
    ),
};
