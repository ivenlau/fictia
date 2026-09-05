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
  isRunning: boolean;
  isPaused: boolean;
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
   * Start pipeline async — returns immediately
   */
  start: (novelId: string) =>
    api.post<{ status: "started"; novelId: string; message: string }>(
      `/novels/${novelId}/pipeline/start`,
    ),

  /**
   * Pause the auto-pipeline (current stage continues to completion)
   */
  pause: (novelId: string) =>
    api.post<{ status: "paused"; novelId: string }>(
      `/novels/${novelId}/pipeline/pause`,
    ),

  /**
   * Resume the auto-pipeline
   */
  resume: (novelId: string) =>
    api.post<{ status: "resumed"; novelId: string }>(
      `/novels/${novelId}/pipeline/resume`,
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
   * Confirm a stage's output (kept for compatibility)
   */
  confirmStage: (novelId: string, stage: StageName) =>
    api.post<{
      status: "confirmed";
      stage: StageName;
      hasMoreWork: boolean;
      message: string;
    }>(`/novels/${novelId}/pipeline/stages/${stage}/confirm`),

  /**
   * 按当前产物强制确认阶段：审核未通过/轮次跑满但核心产物已在时，跳过审核结论放行流程。
   * 产物不成立时后端返回 400 + missing 清单。
   */
  forceConfirmStage: (novelId: string, stage: StageName) =>
    api.post<{
      status: "confirmed";
      stage: StageName;
      message: string;
    }>(`/novels/${novelId}/pipeline/stages/${stage}/force-confirm`),

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
