import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const novels = sqliteTable("novels", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  genre: text("genre").default(""),
  description: text("description").default(""),
  targetChapters: integer("target_chapters").default(28),
  status: text("status").default("creating"),
  pipelineStatus: text("pipeline_status").default("not_started"),
  tags: text("tags").default("[]"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const chapters = sqliteTable("chapters", {
  id: text("id").primaryKey(),
  novelId: text("novel_id").notNull().references(() => novels.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  title: text("title").default(""),
  summary: text("summary").default(""),
  filename: text("filename").default(""),
  version: integer("version").default(1),
  status: text("status").default("empty"),
  goal: text("goal").default(""),
  wordCount: integer("word_count").default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const agentOutputs = sqliteTable("agent_outputs", {
  id: text("id").primaryKey(),
  novelId: text("novel_id").notNull().references(() => novels.id, { onDelete: "cascade" }),
  chapterId: text("chapter_id"),
  agentType: text("agent_type").notNull(),
  stageName: text("stage_name"),
  persona: text("persona"),
  filename: text("filename").default(""),
  modelUsed: text("model_used").default(""),
  providerUsed: text("provider_used").default(""),
  status: text("status").default("running"),
  tokensInput: integer("tokens_input").default(0),
  tokensOutput: integer("tokens_output").default(0),
  cost: real("cost").default(0),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});

export const reviewFeedback = sqliteTable("review_feedback", {
  id: text("id").primaryKey(),
  chapterId: text("chapter_id").notNull().references(() => chapters.id, { onDelete: "cascade" }),
  agentOutputId: text("agent_output_id").notNull().references(() => agentOutputs.id, { onDelete: "cascade" }),
  reviewerType: text("reviewer_type").notNull(),
  persona: text("persona"),
  lineNumber: integer("line_number").default(0),
  severity: text("severity").default("suggestion"),
  message: text("message").default(""),
  status: text("status").default("pending"),
  createdAt: text("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").default(""),
  updatedAt: text("updated_at").notNull(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  novelId: text("novel_id").references(() => novels.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  toolCalls: text("tool_calls"),
  modelUsed: text("model_used"),
  providerUsed: text("provider_used"),
  createdAt: text("created_at").notNull(),
});

export const pipelineState = sqliteTable("pipeline_state", {
  id: text("id").primaryKey(),
  novelId: text("novel_id").notNull().references(() => novels.id, { onDelete: "cascade" }),
  stageName: text("stage_name").notNull(),
  status: text("status").notNull().default("not_started"),
  reason: text("reason"),
  confirmedAt: text("confirmed_at"),
  outputFiles: text("output_files"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
