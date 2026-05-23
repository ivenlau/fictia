import type { StageName } from "@fictia/shared";
import { PROPAGATION_RULES } from "@fictia/shared";
import type { StateTracker } from "./state-tracker.js";

export class UpdatePropagator {
  private stateTracker: StateTracker;

  constructor(stateTracker: StateTracker) {
    this.stateTracker = stateTracker;
  }

  /**
   * Get all downstream stages that need re-processing when a stage is modified.
   * Uses BFS to propagate transitively.
   */
  getAffectedStages(modifiedStage: StageName): StageName[] {
    const affected = new Set<StageName>();
    const queue: StageName[] = [modifiedStage];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const downstream = PROPAGATION_RULES[current] ?? [];

      for (const stage of downstream) {
        if (!affected.has(stage)) {
          const state = this.stateTracker.getState(stage);
          if (
            state.status === "confirmed" ||
            state.status === "needs_update"
          ) {
            affected.add(stage);
            queue.push(stage);
          }
        }
      }
    }

    return Array.from(affected);
  }

  /**
   * Mark all affected downstream stages as needs_update.
   */
  async propagate(modifiedStage: StageName): Promise<StageName[]> {
    const affected = this.getAffectedStages(modifiedStage);

    for (const stage of affected) {
      await this.stateTracker.updateState(stage, {
        status: "needs_update",
        reason: `上游阶段 "${modifiedStage}" 已修改`,
      });
    }

    return affected;
  }
}
