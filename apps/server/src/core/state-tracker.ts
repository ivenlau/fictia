import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { pipelineState } from "../db/schema.js";
import type { StageName, StageStatus } from "@fictia/shared";
import { PIPELINE_DEFINITIONS } from "./pipeline.js";
import { v4 as uuid } from "uuid";

export interface StageState {
  status: StageStatus;
  reason?: string;
  confirmedAt?: string;
  outputFiles?: string[];
}

export class StateTracker {
  private novelId: string;
  private cache: Map<string, StageState> = new Map();

  constructor(novelId: string) {
    this.novelId = novelId;
  }

  async load(): Promise<void> {
    const rows = db
      .select()
      .from(pipelineState)
      .where(eq(pipelineState.novelId, this.novelId))
      .all();

    this.cache.clear();
    for (const row of rows) {
      this.cache.set(row.stageName, {
        status: row.status as StageStatus,
        reason: row.reason ?? undefined,
        confirmedAt: row.confirmedAt ?? undefined,
        outputFiles: row.outputFiles ? JSON.parse(row.outputFiles) : [],
      });
    }
  }

  getState(stageName: string): StageState {
    return this.cache.get(stageName) ?? { status: "not_started" };
  }

  getAllStates(): Record<string, StageState> {
    return Object.fromEntries(this.cache);
  }

  async updateState(
    stageName: StageName | string,
    update: Partial<StageState>
  ): Promise<void> {
    const existing = this.getState(stageName);
    const merged: StageState = { ...existing, ...update };
    this.cache.set(stageName, merged);

    const now = new Date().toISOString();
    const existingRow = db
      .select()
      .from(pipelineState)
      .where(
        and(
          eq(pipelineState.novelId, this.novelId),
          eq(pipelineState.stageName, stageName)
        )
      )
      .get();

    if (existingRow) {
      db.update(pipelineState)
        .set({
          status: merged.status,
          reason: merged.reason ?? null,
          confirmedAt: merged.confirmedAt ?? null,
          outputFiles: merged.outputFiles ? JSON.stringify(merged.outputFiles) : null,
          updatedAt: now,
        })
        .where(
          and(
            eq(pipelineState.novelId, this.novelId),
            eq(pipelineState.stageName, stageName)
          )
        )
        .run();
    } else {
      db.insert(pipelineState)
        .values({
          id: uuid(),
          novelId: this.novelId,
          stageName: stageName,
          status: merged.status,
          reason: merged.reason ?? null,
          confirmedAt: merged.confirmedAt ?? null,
          outputFiles: merged.outputFiles ? JSON.stringify(merged.outputFiles) : null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
  }

  getConfirmedStages(): string[] {
    return Array.from(this.cache.entries())
      .filter(([, s]) => s.status === "confirmed")
      .map(([name]) => name);
  }

  getNextPendingStage(): string | null {
    for (const def of PIPELINE_DEFINITIONS) {
      const s = this.getState(def.name);
      if (s.status === "not_started" || s.status === "needs_update" || s.status === "failed") {
        return def.name;
      }
    }
    return null;
  }

  getInProgressStage(): string | null {
    for (const [name, s] of this.cache) {
      if (s.status === "in_progress") return name;
    }
    return null;
  }

  getProgress(): { confirmed: number; total: number; percentage: number } {
    let confirmed = 0;
    const total = PIPELINE_DEFINITIONS.length;

    for (const def of PIPELINE_DEFINITIONS) {
      const s = this.getState(def.name);
      if (s.status === "confirmed") confirmed++;
    }

    return {
      confirmed,
      total,
      percentage: total > 0 ? Math.round((confirmed / total) * 100) : 0,
    };
  }
}
