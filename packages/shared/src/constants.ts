import type { AgentType, StageName, AgentModelAssignment, ForeshadowState } from "./types";

// ===== Stage ↔ Agent Mapping =====
export const STAGE_TO_AGENT: Record<StageName, AgentType> = {
  genre_analysis: "genre-analyst",
  architecture: "architect",
  style: "style-designer",
  art_design: "art-director",
  narrative_weave: "narrative-weaver",
  world: "world-builder",
  characters: "character-designer",
  story: "story-designer",
  chapters: "chapter-writer",
  editor: "editor",
  consistency: "consistency-checker",
};

export const AGENT_TO_STAGE: Record<AgentType, StageName> = {
  "genre-analyst": "genre_analysis",
  "architect": "architecture",
  "style-designer": "style",
  "art-director": "art_design",
  "narrative-weaver": "narrative_weave",
  "world-builder": "world",
  "character-designer": "characters",
  "story-designer": "story",
  "chapter-writer": "chapters",
  "editor": "editor",
  "consistency-checker": "consistency",
};

// ===== Stage Labels =====
export const STAGE_LABELS: Record<StageName, string> = {
  genre_analysis: "题材分析",
  architecture: "架构设计",
  style: "风格设计",
  art_design: "艺术设计",
  narrative_weave: "叙事编织",
  world: "世界观构建",
  characters: "人物设计",
  story: "故事设计",
  chapters: "章节写作",
  editor: "编辑审核",
  consistency: "一致性校验",
};

// ===== Agent Labels =====
export const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  "genre-analyst": "题材分析师",
  "architect": "架构设计师",
  "style-designer": "风格设计师",
  "art-director": "艺术设计师",
  "narrative-weaver": "叙事编织师",
  "world-builder": "世界观构建师",
  "character-designer": "人物设计师",
  "story-designer": "故事设计师",
  "chapter-writer": "章节写手",
  "editor": "编辑审核员",
  "consistency-checker": "一致性校验员",
};

// ===== Agent Icons (lucide-react icon names) =====
export const AGENT_TYPE_ICONS: Record<AgentType, string> = {
  "genre-analyst": "search",
  "architect": "layout-grid",
  "style-designer": "palette",
  "art-director": "eye",
  "narrative-weaver": "git-branch",
  "world-builder": "globe",
  "character-designer": "users",
  "story-designer": "book-open",
  "chapter-writer": "pen-tool",
  "editor": "check-check",
  "consistency-checker": "shield-check",
};

// ===== Pipeline Stage Dependencies =====
export const STAGE_DEPENDENCIES: Record<StageName, StageName[]> = {
  genre_analysis: [],
  architecture: ["genre_analysis"],
  style: ["genre_analysis", "architecture"],
  art_design: ["genre_analysis", "architecture", "style"],
  narrative_weave: ["genre_analysis", "architecture", "art_design", "style"],
  world: ["genre_analysis", "architecture", "art_design", "narrative_weave"],
  characters: ["world", "architecture", "style", "art_design", "narrative_weave"],
  story: ["architecture", "art_design", "narrative_weave", "world", "characters"],
  chapters: ["style", "art_design", "narrative_weave", "world", "characters", "story"],
  editor: ["chapters", "style"],
  consistency: ["chapters"],
};

// ===== Incremental Stages =====
export const INCREMENTAL_STAGES: StageName[] = [
  "world",
  "characters",
  "story",
  "chapters",
  "editor",
  "consistency",
];

/** Pipeline 阶段的完整执行顺序（用于分阶段重置时切片「该阶段及后续」）。 */
export const STAGE_ORDER: StageName[] = [
  "genre_analysis",
  "architecture",
  "style",
  "art_design",
  "narrative_weave",
  "world",
  "characters",
  "story",
  "chapters",
  "editor",
  "consistency",
];

// ===== Update Propagation Rules =====
export const PROPAGATION_RULES: Record<StageName, StageName[]> = {
  genre_analysis: ["architecture", "style", "art_design", "narrative_weave", "world", "characters", "story", "chapters"],
  architecture: ["narrative_weave", "story", "chapters"],
  style: ["chapters", "editor"],
  art_design: ["narrative_weave", "characters", "story", "chapters"],
  narrative_weave: ["characters", "story", "chapters"],
  world: ["characters", "story", "chapters"],
  characters: ["story", "chapters"],
  story: ["chapters"],
  chapters: ["consistency"],
  editor: [],
  consistency: [],
};

// ===== Pipeline Phase Grouping (for UI) =====
export interface PipelinePhaseGroup {
  label: string;
  stages: StageName[];
}

export const PIPELINE_PHASES: PipelinePhaseGroup[] = [
  {
    label: "前期准备",
    stages: ["genre_analysis", "architecture", "style", "art_design", "narrative_weave"],
  },
  {
    label: "世界构建",
    stages: ["world", "characters", "story"],
  },
  {
    label: "创作",
    stages: ["chapters"],
  },
  {
    label: "打磨",
    stages: ["editor", "consistency"],
  },
];

// ===== Agent File Map (Agent output → workspace file path) =====
export const AGENT_FILE_MAP: Record<AgentType, string> = {
  "genre-analyst": "design/genre-analysis.md",
  "architect": "design/blueprint.md",
  "style-designer": "design/style-guide.md",
  "art-director": "design/art-design.md",
  "narrative-weaver": "design/narrative-weave.md",
  "world-builder": "world/setting.md",
  "character-designer": "characters/",
  "story-designer": "outline/act-1.md",
  "chapter-writer": "chapters/",
  "editor": "reviews/",
  "consistency-checker": "reviews/consistency-report.md",
};

// ===== File Templates (placeholder files for new novel) =====
export const FILE_TEMPLATES: Array<{ path: string; type: string; content: string }> = [
  { path: "meta.json", type: "json", content: "{}" },
  { path: "design/genre-analysis.md", type: "markdown", content: "# 题材分析\n\n等待AI生成..." },
  { path: "design/blueprint.md", type: "markdown", content: "# 架构蓝图\n\n等待AI生成..." },
  { path: "design/style-guide.md", type: "markdown", content: "# 风格指南\n\n等待AI生成..." },
  { path: "design/art-design.md", type: "markdown", content: "# 艺术设计\n\n等待AI生成..." },
  { path: "design/narrative-weave.md", type: "markdown", content: "# 叙事编织\n\n等待AI生成..." },
  { path: "world/setting.md", type: "markdown", content: "# 世界设定\n\n等待AI生成..." },
  { path: "world/rules.md", type: "markdown", content: "# 规则体系\n\n等待AI生成..." },
  { path: "world/timeline.md", type: "markdown", content: "# 时间线\n\n等待AI生成..." },
  { path: "characters/relationships.md", type: "markdown", content: "# 人物关系图\n\n等待AI生成..." },
];

// ===== Default Agent Model Assignments =====
// preset provider id == preset key (e.g. "glm-coding"); old "glm" runtime used the
// coding endpoint, so defaults map to "glm-coding".
export const DEFAULT_AGENT_MODELS: Record<AgentType, AgentModelAssignment> = {
  "genre-analyst": { providerId: "minimax", modelId: "MiniMax-M2.7" },
  "architect": { providerId: "glm-coding", modelId: "glm-5.1" },
  "style-designer": { providerId: "glm-coding", modelId: "glm-5.1" },
  "art-director": { providerId: "glm-coding", modelId: "glm-5.1" },
  "narrative-weaver": { providerId: "glm-coding", modelId: "glm-5.1" },
  "world-builder": { providerId: "minimax", modelId: "MiniMax-M2.7" },
  "character-designer": { providerId: "glm-coding", modelId: "glm-5.1" },
  "story-designer": { providerId: "glm-coding", modelId: "glm-5.1" },
  "chapter-writer": { providerId: "glm-coding", modelId: "glm-5.1" },
  "editor": { providerId: "minimax", modelId: "MiniMax-M2.7" },
  "consistency-checker": { providerId: "minimax", modelId: "MiniMax-M2.7" },
};

// ===== Preset Providers (built-in, seeded into DB) =====
export interface PresetModelDef {
  id: string;
  name: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
}

export interface PresetProviderDef {
  key: string; // used as provider id for preset rows
  name: string;
  baseUrl: string;
  apiFormat: "openai";
  models: PresetModelDef[];
}

// Model ids are a 2026-07 baseline — users can add/remove their own in the UI,
// so an out-of-date id is never fatal. Verify latest ids when maintaining.
export const PRESET_PROVIDERS: PresetProviderDef[] = [
  {
    key: "glm",
    name: "GLM (智谱)",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiFormat: "openai",
    models: [
      { id: "glm-4.6", name: "GLM-4.6" },
      { id: "glm-4.7", name: "GLM-4.7" },
      { id: "glm-5", name: "GLM-5" },
      { id: "glm-5.1", name: "GLM-5.1", reasoning: true },
    ],
  },
  {
    key: "glm-coding",
    name: "GLM Coding Plan (智谱)",
    baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
    apiFormat: "openai",
    models: [
      { id: "glm-4.6", name: "GLM-4.6" },
      { id: "glm-5.1", name: "GLM-5.1", reasoning: true },
    ],
  },
  {
    key: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    apiFormat: "openai",
    models: [
      { id: "deepseek-chat", name: "DeepSeek-V3 (Chat)" },
      { id: "deepseek-reasoner", name: "DeepSeek-R1 (Reasoner)", reasoning: true },
    ],
  },
  {
    key: "qwen",
    name: "通义千问 Qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiFormat: "openai",
    models: [
      { id: "qwen-max", name: "Qwen-Max" },
      { id: "qwen-plus", name: "Qwen-Plus" },
      { id: "qwen-turbo", name: "Qwen-Turbo" },
    ],
  },
  {
    key: "kimi",
    name: "Kimi (月之暗面)",
    baseUrl: "https://api.moonshot.cn/v1",
    apiFormat: "openai",
    models: [
      { id: "kimi-k2-0905-preview", name: "Kimi K2" },
      { id: "moonshot-v1-32k", name: "Moonshot v1 32k" },
      { id: "moonshot-v1-128k", name: "Moonshot v1 128k" },
    ],
  },
  {
    key: "doubao",
    name: "豆包 (火山方舟)",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    apiFormat: "openai",
    models: [
      { id: "doubao-seed-2-0-pro-260215", name: "Doubao Seed 2.0 Pro" },
      { id: "doubao-seed-2-0-lite-260428", name: "Doubao Seed 2.0 Lite" },
      { id: "doubao-seed-2-0-mini-260428", name: "Doubao Seed 2.0 Mini" },
    ],
  },
  {
    key: "minimax",
    name: "Minimax",
    baseUrl: "https://api.minimax.chat/v1",
    apiFormat: "openai",
    models: [
      { id: "MiniMax-M2.5", name: "MiniMax-M2.5" },
      { id: "MiniMax-M2.7", name: "MiniMax-M2.7" },
    ],
  },
  {
    key: "wenxin",
    name: "百度文心 (千帆 v2)",
    baseUrl: "https://qianfan.baidubce.com/v2",
    apiFormat: "openai",
    models: [
      { id: "ernie-4.5-turbo-128k", name: "ERNIE 4.5 Turbo 128k" },
      { id: "ernie-x1-turbo-128k", name: "ERNIE X1 Turbo 128k", reasoning: true },
    ],
  },
];

// ===== Default Chat Model (AI assistant conversation) =====
export const DEFAULT_CHAT_MODEL: AgentModelAssignment = {
  providerId: "glm-coding",
  modelId: "glm-5.1",
};

// ===== Default System Model (background LLM: 参考作品解析 / 章节摘要) =====
export const DEFAULT_SYSTEM_MODEL: AgentModelAssignment = {
  providerId: "glm-coding",
  modelId: "glm-5.1",
};

// ===== Default Chat Persona =====
export const DEFAULT_CHAT_PERSONA =
  "你是一位专业的小说创作助手。你熟悉故事结构、角色塑造、世界观构建等创作技巧。\n你可以帮用户查看和修改小说的各种文档，提供建设性的创作建议。\n请用中文回复，语气友善专业。";

// ===== Foreshadowing State Machine =====
// States: planted(埋设) → strengthened(推进/强化) → resolved(回收).
// `suspended`(悬置) is an out-of-band hold reachable from any non-resolved state.
export const FORESHADOW_STATES: ForeshadowState[] = [
  "planted",
  "strengthened",
  "resolved",
  "suspended",
];

/** operation keyword (from chapter 写作备注) → resulting state */
export const FORESHADOW_OP_TO_STATE: Record<string, ForeshadowState> = {
  埋设: "planted",
  推进: "strengthened",
  强化: "strengthened",
  回收: "resolved",
  悬置: "suspended",
};

/** valid forward transitions; anything not listed is rejected to prevent regressions
 *  (e.g. a resolved 伏笔 cannot be re-planted). */
export const FORESHADOW_TRANSITIONS: Record<ForeshadowState, ForeshadowState[]> = {
  planted: ["strengthened", "resolved", "suspended"],
  strengthened: ["resolved", "suspended"],
  suspended: ["strengthened", "resolved"],
  resolved: [],
};

/**
 * Returns the next state for an op given the current state, or null if the op
 * is unknown or would regress (e.g. re-planting a resolved 伏笔). A no-op
 * (op maps to the current state) returns the current state.
 */
export function transitionForeshadow(current: ForeshadowState, op: string): ForeshadowState | null {
  const next = FORESHADOW_OP_TO_STATE[op];
  if (!next) return null;
  if (next === current) return current;
  return FORESHADOW_TRANSITIONS[current].includes(next) ? next : null;
}
