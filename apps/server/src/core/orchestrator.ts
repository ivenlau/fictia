import { EventEmitter } from "events";
import type { StageName, AgentType } from "@fictia/shared";
import { STAGE_LABELS } from "@fictia/shared";
import { StateTracker } from "./state-tracker.js";
import { UpdatePropagator } from "./update-propagator.js";
import { PIPELINE_DEFINITIONS, type PipelineStage } from "./pipeline.js";
import { createAgentFromStage, type AgentRunResult, type AgentRunOptions } from "../agents/index.js";

export interface OrchestratorEvents {
  "stage:start": (stage: StageName) => void;
  "stage:output": (stage: StageName, result: AgentRunResult) => void;
  "stage:confirm-needed": (stage: StageName, result: AgentRunResult) => void;
  "stage:confirmed": (stage: StageName) => void;
  "stage:failed": (stage: StageName, error: string) => void;
  "pipeline:complete": () => void;
  "update:propagation": (affected: StageName[]) => void;
}

export class Orchestrator extends EventEmitter {
  private pipeline: PipelineStage[];
  private stateTracker: StateTracker;
  private updatePropagator: UpdatePropagator;
  private novelDir: string;
  private novelId: string;
  private apiKeys: Record<string, string>;
  private agentModels?: Record<AgentType, { provider: string; model: string }>;

  constructor(
    novelId: string,
    novelDir: string,
    apiKeys: Record<string, string>,
    agentModels?: Record<AgentType, { provider: string; model: string }>,
  ) {
    super();
    this.novelId = novelId;
    this.novelDir = novelDir;
    this.apiKeys = apiKeys;
    this.agentModels = agentModels;
    this.stateTracker = new StateTracker(novelId);
    this.updatePropagator = new UpdatePropagator(this.stateTracker);
    this.pipeline = PIPELINE_DEFINITIONS;
  }

  async init(): Promise<void> {
    await this.stateTracker.load();
  }

  updateConfig(
    apiKeys: Record<string, string>,
    agentModels?: Record<AgentType, { provider: string; model: string }>,
  ) {
    this.apiKeys = apiKeys;
    this.agentModels = agentModels;
  }

  getStateTracker(): StateTracker {
    return this.stateTracker;
  }

  getNovelDir(): string {
    return this.novelDir;
  }

  /**
   * Start the pipeline from the first pending stage.
   */
  async start(): Promise<AgentRunResult | null> {
    const nextStage = this.stateTracker.getNextPendingStage();
    if (!nextStage) {
      this.emit("pipeline:complete");
      return null;
    }
    return this.runStage(nextStage as StageName);
  }

  /**
   * Run a specific stage.
   */
  async runStage(
    stageName: StageName,
    options?: AgentRunOptions,
  ): Promise<AgentRunResult> {
    const stage = this.pipeline.find(s => s.name === stageName);
    if (!stage) {
      throw new Error(`未知阶段: ${stageName}`);
    }

    // Check dependencies (skip when targeting a specific file — user-initiated)
    if (!options?.incrementalTarget) {
      const unmetDeps = stage.dependsOn.filter(dep => {
        const state = this.stateTracker.getState(dep);
        return state.status !== "confirmed";
      });
      if (unmetDeps.length > 0) {
        throw new Error(
          `阶段 "${STAGE_LABELS[stageName]}" 的前置依赖未满足: ${unmetDeps.map(d => STAGE_LABELS[d]).join(", ")}`
        );
      }
    }

    this.emit("stage:start", stageName);
    console.log(`[Pipeline] Running stage: ${stageName}`);
    await this.stateTracker.updateState(stageName, { status: "in_progress" });

    try {
      const agent = createAgentFromStage(
        stageName,
        this.novelDir,
        this.apiKeys,
        this.agentModels,
      );

      const result = await agent.run(options);

      this.emit("stage:output", stageName, result);

      if (result.success) {
        // Auto-confirm on success
        const hasMore = await this.confirmStage(stageName);
        if (hasMore) {
          await this.stateTracker.updateState(stageName, {
            status: "needs_update",
            reason: "增量阶段还有更多工作",
          });
        }
      } else {
        // Agent returned but indicated failure
        await this.stateTracker.updateState(stageName, {
          status: "failed",
          reason: result.error ?? "Agent returned unsuccessful result",
        });
        this.emit("stage:failed", stageName, result.error ?? "Agent returned unsuccessful result");
      }

      return result;
    } catch (error) {
      const errorMsg = String(error);
      await this.stateTracker.updateState(stageName, {
        status: "failed",
        reason: errorMsg,
      });
      this.emit("stage:failed", stageName, errorMsg);
      throw error;
    }
  }

  /**
   * Confirm the current stage. For incremental stages, checks if there's
   * more work to do.
   */
  async confirmStage(stageName: StageName): Promise<boolean> {
    const stage = this.pipeline.find(s => s.name === stageName);
    if (!stage) throw new Error(`未知阶段: ${stageName}`);

    if (stage.canRunIncremental) {
      const agent = createAgentFromStage(
        stageName,
        this.novelDir,
        this.apiKeys,
        this.agentModels,
      );
      const moreWork = await agent.hasMoreWork();
      if (moreWork) {
        console.log(`[Pipeline] Stage "${stageName}" has more work, continuing...`);
        return true;
      }
    }

    await this.stateTracker.updateState(stageName, {
      status: "confirmed",
      confirmedAt: new Date().toISOString(),
    });
    this.emit("stage:confirmed", stageName);
    console.log(`[Pipeline] Stage "${stageName}" confirmed`);
    return false;
  }

  /**
   * Handle modification of a stage's output — propagate updates.
   */
  async onStageModified(stageName: StageName): Promise<StageName[]> {
    const affected = await this.updatePropagator.propagate(stageName);
    if (affected.length > 0) {
      this.emit("update:propagation", affected);
      console.log(`[Pipeline] Propagation: ${affected.join(", ")} need update`);
    }
    return affected;
  }

  /**
   * Resume from last state.
   */
  async resume(): Promise<AgentRunResult | null> {
    await this.stateTracker.load();

    const inProgress = this.stateTracker.getInProgressStage();
    if (inProgress) {
      return this.runStage(inProgress as StageName, { isRedo: true });
    }

    const next = this.stateTracker.getNextPendingStage();
    if (next) {
      const state = this.stateTracker.getState(next);
      if (state.status === "needs_update") {
        return this.runStage(next as StageName, { isRedo: true });
      }
      return this.start();
    }

    this.emit("pipeline:complete");
    return null;
  }
}
