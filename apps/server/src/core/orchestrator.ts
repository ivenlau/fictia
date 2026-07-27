import { EventEmitter } from "events";
import type { StageName, AgentType, AgentModelAssignment } from "@fictia/shared";
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
  private agentModels?: Partial<Record<AgentType, AgentModelAssignment>>;

  constructor(
    novelId: string,
    novelDir: string,
    agentModels?: Partial<Record<AgentType, AgentModelAssignment>>,
  ) {
    super();
    this.novelId = novelId;
    this.novelDir = novelDir;
    this.agentModels = agentModels;
    this.stateTracker = new StateTracker(novelId);
    this.updatePropagator = new UpdatePropagator(this.stateTracker);
    this.pipeline = PIPELINE_DEFINITIONS;
  }

  async init(): Promise<void> {
    await this.stateTracker.load();
  }

  updateConfig(agentModels?: Partial<Record<AgentType, AgentModelAssignment>>) {
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
        this.agentModels,
      );
      // 注入调试 trace 文件名（由调用方经 options 提供）；agent 自行增量写文件
      if (options?.traceFilename) agent.traceFilename = options.traceFilename;

      // 注入小说元信息（targetChapters 等）到 extraContext，供 architect 据长度规划幕数。
      // 动态 import 规避 orchestrator ↔ novel.service 的静态循环依赖。
      let runOptions = options;
      try {
        const { novelService } = await import("../services/novel.service.js");
        const novel = novelService.getById(this.novelId);
        if (novel) {
          const meta = novelService.buildMetaContext(novel);
          runOptions = {
            ...options,
            extraContext: options?.extraContext ? `${options.extraContext}\n\n---\n\n${meta}` : meta,
          };
        }
      } catch {
        // 元信息注入失败不阻塞 stage 执行
      }

      const result = await agent.run(runOptions);
      // 回传 trace 与文件名，供调用方回填 agent_outputs 行
      if (agent.lastTrace) result.trace = agent.lastTrace;
      if (agent.traceFilename) result.traceFilename = agent.traceFilename;

      this.emit("stage:output", stageName, result);

      if (result.success) {
        if (options?.autoConfirm === false) {
          // 手动确认纪律（对齐 skill）：成功后置 pending_confirm，等用户显式 /confirm
          await this.stateTracker.updateState(stageName, { status: "pending_confirm" });
        } else {
          // Auto-confirm on success（auto-runner 默认）
          const hasMore = await this.confirmStage(stageName);
          if (hasMore) {
            await this.stateTracker.updateState(stageName, {
              status: "needs_update",
              reason: "增量阶段还有更多工作",
            });
          }
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
