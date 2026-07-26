import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { Orchestrator } from "../core/orchestrator.js";
import type { StageName, AgentType, AgentModelAssignment } from "@fictia/shared";
import { STAGE_LABELS } from "@fictia/shared";
import type { AgentRunResult } from "../agents/index.js";
import { readFileSafe } from "../utils/file.js";
import { db, schema } from "../db/index.js";
import { getStageDefinition } from "../core/pipeline.js";
import * as path from "path";
import * as fs from "fs/promises";

const now = () => new Date().toISOString();

// In-memory orchestrator instances per novel
const orchestrators = new Map<string, Orchestrator>();

export function getOrCreateOrchestrator(
  novelId: string,
  novelDir: string,
  agentModels?: Partial<Record<AgentType, AgentModelAssignment>>,
): Orchestrator {
  let orch = orchestrators.get(novelId);
  if (!orch) {
    orch = new Orchestrator(novelId, novelDir, agentModels);
    orchestrators.set(novelId, orch);
  } else {
    orch.updateConfig(agentModels);
  }
  return orch;
}

export function removeOrchestrator(novelId: string): void {
  orchestrators.delete(novelId);
}

/**
 * Write agent output to the novel's file system.
 */
export async function writeAgentOutput(
  novelDir: string,
  result: AgentRunResult,
): Promise<void> {
  // Agents that use write_project_file tool have already written correct content.
  // Skip writing if any output files already exist on disk (written by tool calls).
  for (const filePath of result.filesWritten) {
    if (filePath.includes("*")) continue; // Skip glob patterns
    const fullPath = path.join(novelDir, filePath);
    const existing = await readFileSafe(fullPath);
    if (existing) {
      return;
    }
  }

  // No files written by tools — write from result.output

  if (result.output.includes("===FILE:")) {
    const fileBlocks = result.output.split(/===FILE:\s*(.+?)\s*===/);
    for (let i = 1; i < fileBlocks.length; i += 2) {
      const fileName = fileBlocks[i].trim();
      const content = fileBlocks[i + 1]?.trim() ?? "";
      const targetPath = path.join(novelDir, fileName);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, content, "utf-8");
    }
    return;
  }

  // 单文件直写：仅当唯一声明是具体文件（非 glob）时。
  // glob 模式（如 characters/*.md、outline/*.md）表示「写了一类文件」，具体文件
  // 应由上面的 ===FILE: 分隔符或 write_project_file 工具落地；把整段 output 写到
  // 字面含 * 的文件名是非法的（Windows 上 fs.writeFile 直接 ENOENT）。
  const single = result.filesWritten[0];
  if (single && !single.includes("*")) {
    const fullPath = path.join(novelDir, single);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, result.output, "utf-8");
  } else if (result.output.trim()) {
    console.warn(
      `[Pipeline] 阶段产物未落盘：filesWritten=${JSON.stringify(result.filesWritten)} 且 output 未使用 ===FILE: 分隔符（可能 LLM 输出格式不符，建议重跑该阶段）`,
    );
  }
}

/**
 * Get the existing output for a stage from the file system.
 */
export async function getStageOutput(
  novelDir: string,
  outputFiles: string[],
): Promise<string | null> {
  const parts: string[] = [];
  for (const file of outputFiles) {
    const content = await readFileSafe(path.join(novelDir, file));
    if (content) {
      parts.push(content);
    }
  }
  return parts.length > 0 ? parts.join("\n\n---\n\n") : null;
}

// ===== Pipeline Runner — async execution with pause/resume =====

export class PipelineRunner {
  private orch: Orchestrator;
  private novelId: string;
  private novelDir: string;
  private _running = false;
  private _paused = false;

  constructor(orch: Orchestrator, novelId: string, novelDir: string) {
    this.orch = orch;
    this.novelId = novelId;
    this.novelDir = novelDir;
  }

  get running() { return this._running; }
  get paused() { return this._paused; }

  async start(): Promise<void> {
    if (this._running) throw new Error("Pipeline already running");
    this._running = true;
    this._paused = false;

    try {
      while (this._running) {
        // Wait while paused
        if (this._paused) {
          await this.waitUntilResumed();
          if (!this._running) break;
        }

        await this.orch.init();
        const nextStageName = this.orch.getStateTracker().getNextPendingStage();
        if (!nextStageName) {
          this.orch.emit("pipeline:complete");
          break;
        }

        const def = getStageDefinition(nextStageName as StageName);
        if (!def) break;

        // Create agent_outputs record
        const outputId = uuid();
        db.insert(schema.agentOutputs)
          .values({
            id: outputId,
            novelId: this.novelId,
            chapterId: null,
            agentType: def.agentType,
            stageName: nextStageName,
            persona: null,
            filename: "",
            modelUsed: "",
            providerUsed: "",
            status: "running",
            tokensInput: 0,
            tokensOutput: 0,
            cost: 0,
            createdAt: now(),
            completedAt: null,
          })
          .run();

        try {
          const result = await this.orch.runStage(nextStageName as StageName);

          if (result.success) {
            await writeAgentOutput(this.novelDir, result);
          }

          // Update agent_outputs record
          db.update(schema.agentOutputs)
            .set({
              status: result.success ? "completed" : "failed",
              tokensOutput: result.output?.length ?? 0,
              completedAt: now(),
            })
            .where(eq(schema.agentOutputs.id, outputId))
            .run();

          if (!result.success) {
            console.log(`[Pipeline] Stage "${nextStageName}" failed, stopping pipeline`);
            break;
          }
        } catch (stageErr: any) {
          // Mark output as failed
          db.update(schema.agentOutputs)
            .set({ status: "failed", completedAt: now() })
            .where(eq(schema.agentOutputs.id, outputId))
            .run();

          console.error(`[Pipeline] Stage "${nextStageName}" error:`, stageErr?.message);
          break;
        }
      }
    } finally {
      this._running = false;
      this._paused = false;
      runners.delete(this.novelId);
    }
  }

  pause(): void {
    if (!this._running) return;
    this._paused = true;
  }

  resume(): void {
    this._paused = false;
  }

  stop(): void {
    this._running = false;
    this._paused = false;
  }

  private waitUntilResumed(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (!this._paused || !this._running) {
          resolve();
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    });
  }
}

// In-memory runners per novel
const runners = new Map<string, PipelineRunner>();

export function getOrCreateRunner(
  novelId: string,
  orch: Orchestrator,
  novelDir: string,
): PipelineRunner {
  let runner = runners.get(novelId);
  if (!runner) {
    runner = new PipelineRunner(orch, novelId, novelDir);
    runners.set(novelId, runner);
  }
  return runner;
}

export function getRunner(novelId: string): PipelineRunner | undefined {
  return runners.get(novelId);
}

export function getRunnerState(novelId: string): { isRunning: boolean; isPaused: boolean } {
  const runner = runners.get(novelId);
  return { isRunning: runner?.running ?? false, isPaused: runner?.paused ?? false };
}
