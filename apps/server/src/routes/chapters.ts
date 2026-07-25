import { Router } from "express";
import { chapterService } from "../services/chapter.service.js";
import { novelService } from "../services/novel.service.js";

const router = Router();

// GET /novels/:novelId/chapters - list chapters for a novel
router.get("/novels/:novelId/chapters", async (req, res) => {
  const novel = novelService.getById(req.params.novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }

  const chapters = await chapterService.listByNovel(req.params.novelId);
  res.json(chapters);
});

// GET /chapters/:id - get chapter by id
router.get("/chapters/:id", async (req, res) => {
  const chapter = await chapterService.getById(req.params.id);
  if (!chapter) {
    res.status(404).json({ error: "Chapter not found" });
    return;
  }
  res.json(chapter);
});

// PATCH /chapters/:id - update chapter
router.patch("/chapters/:id", async (req, res) => {
  const existing = await chapterService.getById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Chapter not found" });
    return;
  }

  const chapter = await chapterService.update(req.params.id, req.body);
  res.json(chapter);
});

// GET /chapters/:id/feedback - get feedback for a chapter
router.get("/chapters/:id/feedback", async (req, res) => {
  const chapter = await chapterService.getById(req.params.id);
  if (!chapter) {
    res.status(404).json({ error: "Chapter not found" });
    return;
  }

  const feedback = await chapterService.getFeedback(req.params.id);
  res.json(feedback);
});

export const chapterRoutes = router;
