// ===== Pipeline Stage Names (snake_case internal keys) =====
export type StageName =
  | "genre_analysis"
  | "architecture"
  | "style"
  | "art_design"
  | "narrative_weave"
  | "world"
  | "characters"
  | "story"
  | "chapters"
  | "editor"
  | "consistency";

// ===== Agent Types (CLI naming convention) =====
export type AgentType =
  | "genre-analyst"
  | "architect"
  | "style-designer"
  | "art-director"
  | "narrative-weaver"
  | "world-builder"
  | "character-designer"
  | "story-designer"
  | "chapter-writer"
  | "editor"
  | "consistency-checker";

// ===== Pipeline Stage Status =====
export type StageStatus =
  | "not_started"
  | "in_progress"
  | "pending_confirm"
  | "confirmed"
  | "needs_update"
  | "failed";

// ===== Existing V2 Types (preserved) =====
export type NovelStatus = "creating" | "researching" | "writing" | "reviewing" | "completed";
export type ChapterStatus = "empty" | "draft" | "reviewing" | "approved" | "needs_rewrite";
export type AgentStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type FeedbackStatus = "pending" | "adopted" | "ignored" | "resolved";
export type FeedbackSeverity = "suggestion" | "warning" | "critical";

export interface Novel {
  id: string;
  title: string;
  genre: string;
  description: string;
  targetChapters: number;
  status: NovelStatus;
  tags: string[];
  pipelineStatus: StageStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Chapter {
  id: string;
  novelId: string;
  number: number;
  title: string;
  summary: string;
  filename: string;
  content?: string;
  version: number;
  status: ChapterStatus;
  goal: string;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentOutput {
  id: string;
  novelId: string;
  chapterId: string | null;
  agentType: AgentType;
  stageName: StageName | null;
  persona: string | null;
  filename: string;
  content?: string;
  modelUsed: string;
  providerUsed: string;
  status: AgentStatus;
  tokensInput: number;
  tokensOutput: number;
  cost: number;
  createdAt: string;
  completedAt: string | null;
}

export interface ReviewFeedback {
  id: string;
  chapterId: string;
  agentOutputId: string;
  reviewerType: string;
  persona: string | null;
  lineNumber: number;
  severity: FeedbackSeverity;
  message: string;
  status: FeedbackStatus;
  createdAt: string;
}

export interface WorkspaceFile {
  id: string;
  novelId: string;
  path: string;
  type: "markdown" | "json" | "yaml" | "folder";
  content: string;
  createdAt: string;
  updatedAt: string;
}

export type EmbeddingProvider = "glm" | "bge-m3";

// ===== Provider / Model Management =====
export type ProviderType = "preset" | "custom";
export type ApiFormat = "openai";

export interface ModelInfo {
  id: string;
  providerId: string;
  type: ProviderType;
  name: string;
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  enabled: boolean;
  sort: number;
}

export interface ProviderInfo {
  id: string;
  type: ProviderType;
  presetKey: string | null;
  name: string;
  baseUrl: string;
  apiFormat: ApiFormat;
  apiKey: string; // masked (****xxxx) when sent to client
  enabled: boolean;
  sort: number;
  models: ModelInfo[];
}

export interface AgentModelAssignment {
  providerId: string;
  modelId: string;
}

export interface Settings {
  agentModels: Record<AgentType, AgentModelAssignment>;
  chatPersona: string;
  embeddingProvider: EmbeddingProvider;
}

export interface ChatMessage {
  id: string;
  novelId: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls: Array<{ tool: string; input: string; result: string }> | null;
  modelUsed: string | null;
  providerUsed: string | null;
  createdAt: string;
}

export interface ChatRequest {
  message: string;
  novelId?: string;
  providerId: string;
  modelId: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface CreateNovelRequest {
  title: string;
  genre: string;
  description: string;
  targetChapters: number;
  tags: string[];
}

export interface TriggerAgentRequest {
  agentType: AgentType;
  persona?: string;
}

// ===== Pipeline State =====
export interface PipelineStageState {
  stageName: StageName;
  status: StageStatus;
  reason: string | null;
  confirmedAt: string | null;
  outputFiles: string[];
  updatedAt: string;
}

export interface PipelineStatus {
  novelId: string;
  stages: PipelineStageState[];
  isRunning: boolean;
  activeStage: StageName | null;
}

// ===== Stage Run Options =====
export interface StageRunOptions {
  redo?: boolean;
  directive?: string;
  incrementalTarget?: string;
}
