import type { AgentType, StageName } from "./types";

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
  "genre-analyst": "genre-analysis.md",
  "architect": "blueprint.md",
  "style-designer": "style-guide.md",
  "art-director": "art-design.md",
  "narrative-weaver": "narrative-weave.md",
  "world-builder": "world/setting.md",
  "character-designer": "characters/protagonist.md",
  "story-designer": "outline/act-1.md",
  "chapter-writer": "chapters/act-1/ch01.md",
  "editor": "reviews/",
  "consistency-checker": "reviews/consistency-report.md",
};

// ===== File Templates (placeholder files for new novel) =====
export const FILE_TEMPLATES: Array<{ path: string; type: string; content: string }> = [
  { path: "meta.json", type: "json", content: "{}" },
  { path: "genre-analysis.md", type: "markdown", content: "# 题材分析\n\n等待AI生成..." },
  { path: "blueprint.md", type: "markdown", content: "# 架构蓝图\n\n等待AI生成..." },
  { path: "style-guide.md", type: "markdown", content: "# 风格指南\n\n等待AI生成..." },
  { path: "art-design.md", type: "markdown", content: "# 艺术设计\n\n等待AI生成..." },
  { path: "narrative-weave.md", type: "markdown", content: "# 叙事编织\n\n等待AI生成..." },
  { path: "world/setting.md", type: "markdown", content: "# 世界设定\n\n等待AI生成..." },
  { path: "world/rules.md", type: "markdown", content: "# 规则体系\n\n等待AI生成..." },
  { path: "world/timeline.md", type: "markdown", content: "# 时间线\n\n等待AI生成..." },
  { path: "characters/protagonist.md", type: "markdown", content: "# 主角\n\n等待AI生成..." },
  { path: "characters/antagonist.md", type: "markdown", content: "# 反派\n\n等待AI生成..." },
  { path: "characters/relationships.md", type: "markdown", content: "# 人物关系图\n\n等待AI生成..." },
];

// ===== Provider Labels =====
export const PROVIDER_LABELS: Record<string, string> = {
  glm: "GLM (智谱)",
  minimax: "Minimax",
  doubao: "Doubao (豆包)",
};

// ===== Default Models per Provider =====
export const DEFAULT_MODELS: Record<string, string[]> = {
  glm: ["glm-4.7", "glm-5", "glm-5.1"],
  minimax: ["MiniMax-M2.5", "MiniMax-M2.7"],
  doubao: ["doubao-seed-2-0-pro-260215", "doubao-seed-2-0-lite-260428", "doubao-seed-2-0-mini-260428"],
};

// ===== Default Agent Model Assignments =====
export const DEFAULT_AGENT_MODELS: Record<AgentType, { provider: string; model: string }> = {
  "genre-analyst": { provider: "minimax", model: "MiniMax-M2.7" },
  "architect": { provider: "glm", model: "glm-5.1" },
  "style-designer": { provider: "glm", model: "glm-5.1" },
  "art-director": { provider: "glm", model: "glm-5.1" },
  "narrative-weaver": { provider: "glm", model: "glm-5.1" },
  "world-builder": { provider: "minimax", model: "MiniMax-M2.7" },
  "character-designer": { provider: "glm", model: "glm-5.1" },
  "story-designer": { provider: "glm", model: "glm-5.1" },
  "chapter-writer": { provider: "glm", model: "glm-5.1" },
  "editor": { provider: "minimax", model: "MiniMax-M2.7" },
  "consistency-checker": { provider: "minimax", model: "MiniMax-M2.7" },
};

// ===== Chat Models =====
export const CHAT_MODELS: Array<{ provider: string; model: string; label: string }> = [
  { provider: "glm", model: "glm-4.7", label: "GLM-4.7 (智谱)" },
  { provider: "glm", model: "glm-5", label: "GLM-5 (智谱)" },
  { provider: "glm", model: "glm-5.1", label: "GLM-5.1 (智谱)" },
  { provider: "minimax", model: "MiniMax-M2.5", label: "MiniMax-M2.5" },
  { provider: "minimax", model: "MiniMax-M2.7", label: "MiniMax-M2.7" },
  { provider: "doubao", model: "doubao-seed-2-0-pro-260215", label: "Doubao Seed 2.0 Pro" },
  { provider: "doubao", model: "doubao-seed-2-0-lite-260428", label: "Doubao Seed 2.0 Lite" },
  { provider: "doubao", model: "doubao-seed-2-0-mini-260428", label: "Doubao Seed 2.0 Mini" },
];

// ===== Default Chat Persona =====
export const DEFAULT_CHAT_PERSONA =
  "你是一位专业的小说创作助手。你熟悉故事结构、角色塑造、世界观构建等创作技巧。\n你可以帮用户查看和修改小说的各种文档，提供建设性的创作建议。\n请用中文回复，语气友善专业。";
