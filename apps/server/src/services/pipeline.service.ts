import { Orchestrator } from "../core/orchestrator.js";
import type { StageName, AgentType } from "@fictia/shared";
import type { AgentRunResult } from "../agents/index.js";
import { readFileSafe } from "../utils/file.js";
import * as path from "path";
import * as fs from "fs/promises";

// In-memory orchestrator instances per novel
const orchestrators = new Map<string, Orchestrator>();

export function getOrCreateOrchestrator(
  novelId: string,
  novelDir: string,
  apiKeys: Record<string, string>,
  agentModels?: Record<AgentType, { provider: string; model: string }>,
): Orchestrator {
  let orch = orchestrators.get(novelId);
  if (!orch) {
    orch = new Orchestrator(novelId, novelDir, apiKeys, agentModels);
    orchestrators.set(novelId, orch);
  } else {
    orch.updateConfig(apiKeys, agentModels);
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
  for (const filePath of result.filesWritten) {
    const fullPath = path.join(novelDir, filePath);

    // If the agent output contains file separators, split and write each file
    if (result.output.includes("===FILE:")) {
      const fileBlocks = result.output.split(/===FILE:\s*(.+?)\s*===/);
      // fileBlocks: [preamble, filename1, content1, filename2, content2, ...]
      for (let i = 1; i < fileBlocks.length; i += 2) {
        const fileName = fileBlocks[i].trim();
        const content = fileBlocks[i + 1]?.trim() ?? "";
        const targetPath = path.join(novelDir, fileName);
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, content, "utf-8");
      }
      return;
    }
  }

  // Single file output
  if (result.filesWritten.length === 1) {
    const fullPath = path.join(novelDir, result.filesWritten[0]);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, result.output, "utf-8");
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
