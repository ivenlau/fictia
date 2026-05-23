import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";

const router = Router();

// PATCH /:id/adopt - mark feedback as adopted
router.patch("/:id/adopt", (req, res) => {
  const feedback = db
    .select()
    .from(schema.reviewFeedback)
    .where(eq(schema.reviewFeedback.id, req.params.id))
    .get();

  if (!feedback) {
    res.status(404).json({ error: "Feedback not found" });
    return;
  }

  db.update(schema.reviewFeedback)
    .set({ status: "adopted" })
    .where(eq(schema.reviewFeedback.id, req.params.id))
    .run();

  const updated = db
    .select()
    .from(schema.reviewFeedback)
    .where(eq(schema.reviewFeedback.id, req.params.id))
    .get();

  res.json(updated);
});

// PATCH /:id/ignore - mark feedback as ignored
router.patch("/:id/ignore", (req, res) => {
  const feedback = db
    .select()
    .from(schema.reviewFeedback)
    .where(eq(schema.reviewFeedback.id, req.params.id))
    .get();

  if (!feedback) {
    res.status(404).json({ error: "Feedback not found" });
    return;
  }

  db.update(schema.reviewFeedback)
    .set({ status: "ignored" })
    .where(eq(schema.reviewFeedback.id, req.params.id))
    .run();

  const updated = db
    .select()
    .from(schema.reviewFeedback)
    .where(eq(schema.reviewFeedback.id, req.params.id))
    .get();

  res.json(updated);
});

export const feedbackRoutes = router;
