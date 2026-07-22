import express from "express";
import cors from "cors";
import { novelRoutes } from "./routes/novels.js";
import { chapterRoutes } from "./routes/chapters.js";
import { agentRoutes } from "./routes/agents.js";
import { pipelineRoutes } from "./routes/pipelines.js";
import { writingLoopRoutes } from "./routes/writing-loop.js";
import { brainstormRoutes } from "./routes/brainstorm.js";
import { vectorRoutes } from "./routes/vector.js";
import { entityRoutes } from "./routes/entity.js";
import { graphRoutes } from "./routes/graph.js";
import { settingsRoutes } from "./routes/settings.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { chatRoutes } from "./routes/chat.js";
import { errorHandler } from "./middleware/error-handler.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  app.use("/api/novels", novelRoutes);
  app.use("/api", chapterRoutes);
  app.use("/api", agentRoutes);
  app.use("/api", pipelineRoutes);
  app.use("/api", writingLoopRoutes);
  app.use("/api", brainstormRoutes);
  app.use("/api", vectorRoutes);
  app.use("/api", entityRoutes);
  app.use("/api", graphRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/feedback", feedbackRoutes);
  app.use("/api/chat", chatRoutes);

  app.use(errorHandler);

  return app;
}
