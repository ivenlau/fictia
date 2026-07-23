import { Router } from "express";
import { novelService } from "../services/novel.service.js";

const router = Router();

// GET / - list all novels
router.get("/", (_req, res) => {
  const novels = novelService.list();
  res.json(novels);
});

// GET /search?q=keyword - global search across files and chapters
router.get("/search", async (req, res) => {
  const q = req.query.q as string;
  if (!q || !q.trim()) {
    res.json([]);
    return;
  }
  const results = await novelService.search(q);
  res.json(results);
});

// POST / - create novel
router.post("/", async (req, res) => {
  const { title, genre, description, targetChapters, tags } = req.body;

  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const novel = await novelService.create({
    title,
    genre: genre ?? "",
    description: description ?? "",
    targetChapters: targetChapters ?? 28,
    tags: tags ?? [],
  });

  res.status(201).json(novel);
});

// GET /:id - get novel by id
router.get("/:id", (req, res) => {
  const novel = novelService.getById(req.params.id);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  res.json(novel);
});

// GET /:id/meta - read meta.json (genreCard 等运行时配置；DB 不存)
router.get("/:id/meta", async (req, res) => {
  const meta = await novelService.getMeta(req.params.id);
  if (meta === null) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  res.json(meta);
});

// PATCH /:id - update novel
router.patch("/:id", async (req, res) => {
  const existing = novelService.getById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }

  const novel = await novelService.update(req.params.id, req.body);
  res.json(novel);
});

// POST /:id/reset - reset novel to fresh state
router.post("/:id/reset", async (req, res) => {
  const existing = novelService.getById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }

  const novel = await novelService.reset(req.params.id);
  res.json(novel);
});

// DELETE /:id - delete novel
router.delete("/:id", async (req, res) => {
  const existing = novelService.getById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }

  await novelService.delete(req.params.id);
  res.status(204).end();
});

// GET /:id/files - list workspace files for a novel
router.get("/:id/files", async (req, res) => {
  const novel = novelService.getById(req.params.id);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }

  const files = await novelService.getWorkspaceFiles(req.params.id);
  res.json(files);
});

// PATCH /:id/files/* - update workspace file content
router.patch("/:id/files/*", async (req, res) => {
  const novel = novelService.getById(req.params.id);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }

  const { content } = req.body;
  if (typeof content !== "string") {
    res.status(400).json({ error: "content must be a string" });
    return;
  }

  const filePath = (req.params as any)[0];
  const file = await novelService.updateWorkspaceFile(req.params.id, filePath, content);
  if (!file) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  res.json(file);
});

export const novelRoutes = router;
