import { Router } from "express";
import { eq } from "drizzle-orm";
import type { StageName, AgentType, AgentModelAssignment } from "@fictia/shared";
import { db, schema } from "../db/index.js";
import { novelService } from "../services/novel.service.js";
import { fileService } from "../services/file.service.js";
import {
  exploreDirections,
  produceWithDirection,
  isDesignStage,
} from "../services/brainstorm.service.js";

const router = Router();

function getAgentModels(): Partial<Record<AgentType, AgentModelAssignment>> | undefined {
  const row = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "agentModels"))
    .get();
  if (row?.value) {
    try {
      return JSON.parse(row.value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

const ALL_STAGES: StageName[] = [
  "genre_analysis", "architecture", "style", "art_design", "narrative_weave",
  "world", "characters", "story", "chapters", "editor", "consistency",
];

function parseStage(stage: string): StageName | null {
  return ALL_STAGES.includes(stage as StageName) ? (stage as StageName) : null;
}

/**
 * POST /novels/:novelId/brainstorm/explore
 *   body: { stage: StageName, directive?: string }
 * 头脑风暴探索段：产出 3-5 个创意方向（不写文件）。
 */
router.post("/novels/:novelId/brainstorm/explore", async (req, res) => {
  const { novelId } = req.params;
  const { stage, directive } = req.body ?? {};

  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  const stageName = parseStage(stage);
  if (!stageName || !isDesignStage(stageName)) {
    res.status(400).json({ error: "stage 必须是设计阶段(1-8)" });
    return;
  }

  const novelDir = fileService.getNovelDir(novelId);
  const agentModels = getAgentModels();

  try {
    const result = await exploreDirections(novelDir, stageName, agentModels, directive);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "探索失败" });
  }
});

/**
 * POST /novels/:novelId/brainstorm/produce
 *   body: { stage: StageName, direction: string }
 * 头脑风暴产出段：按已确认方向产出最终设定文件。
 */
router.post("/novels/:novelId/brainstorm/produce", async (req, res) => {
  const { novelId } = req.params;
  const { stage, direction } = req.body ?? {};

  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  const stageName = parseStage(stage);
  if (!stageName || !isDesignStage(stageName)) {
    res.status(400).json({ error: "stage 必须是设计阶段(1-8)" });
    return;
  }
  if (!direction) {
    res.status(400).json({ error: "direction 必填" });
    return;
  }

  const novelDir = fileService.getNovelDir(novelId);
  const agentModels = getAgentModels();

  try {
    const result = await produceWithDirection(novelDir, stageName, direction, agentModels);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "产出失败" });
  }
});

export const brainstormRoutes = router;
