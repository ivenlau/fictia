import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";

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
  // 调试 trace：文件名 + 汇总计数（列表页免读文件即可展示）
  traceFilename: text("trace_filename").default(""),
  turnCount: integer("turn_count").default(0),
  toolCallCount: integer("tool_call_count").default(0),
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

export const providers = sqliteTable("providers", {
  id: text("id").primaryKey(), // preset slug or UUID
  type: text("type").notNull(), // "preset" | "custom"
  presetKey: text("preset_key"),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  apiFormat: text("api_format").notNull().default("openai"),
  apiKey: text("api_key").default(""),
  enabled: integer("enabled").notNull().default(1),
  sort: integer("sort").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const models = sqliteTable(
  "models",
  {
    id: text("id").notNull(),
    providerId: text("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // "preset" | "custom"
    name: text("name").notNull(),
    contextWindow: integer("context_window").default(128000),
    maxTokens: integer("max_tokens").default(8192),
    reasoning: integer("reasoning").default(0),
    enabled: integer("enabled").notNull().default(1),
    sort: integer("sort").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.providerId, t.id] })],
);
