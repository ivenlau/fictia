/**
 * 工具平台入口：注册所有工具工厂 + 各 agent 的工具清单。
 *
 * 被任一使用工具的模块 import 即触发注册（agents/index.ts import）。
 * agent 工具清单替代原 BaseAgent.getToolTier() 的二分，显式声明工具名，
 * 按角色分配只读查询工具（叙事状态/实体/素材/语义检索）。
 */
import type { AgentType } from "@fictia/shared";
import { toolRegistry } from "./registry.js";
import { createFileTools } from "./file-tools.js";
import { createChapterTools } from "./chapter-tools.js";
import { createCharacterTools } from "./character-tools.js";
import { createReviewTools } from "./review-tools.js";
import { createChatTools } from "./chat-tools.js";
import { createNarrativeStateTools } from "./narrative-state-tools.js";
import { createEntityTools } from "./entity-tools.js";
import { createMaterialTools } from "./material-tools.js";
import { createSemanticSearchTool } from "./semantic-search-tool.js";

// ---------- 工具工厂注册 ----------
toolRegistry.registerFactory(createFileTools);
toolRegistry.registerFactory(createChapterTools);
toolRegistry.registerFactory(createCharacterTools);
toolRegistry.registerFactory(createReviewTools);
toolRegistry.registerFactory(createChatTools);
toolRegistry.registerFactory(createNarrativeStateTools);
toolRegistry.registerFactory(createEntityTools);
toolRegistry.registerFactory(createMaterialTools);
toolRegistry.registerFactory(createSemanticSearchTool);

// ---------- 工具组（按域聚合，便于组合分配） ----------
const FILE_TOOLS = ["read_file", "write_file", "edit_file", "list_files", "count_words"];
const CHAPTER_FULL_TOOLS = [
  ...FILE_TOOLS,
  "get_chapter_context",
  "get_character",
  "validate_style",
  "scan_consistency",
];
const NARRATIVE_TOOLS = [
  "get_foreshadowing_stats",
  "get_foreshadow",
  "get_summary_chain",
  "get_chapter_summary",
  "get_writing_space",
];
const ENTITY_TOOLS = ["search_entities", "get_entity", "get_entity_neighbors", "get_entity_stats"];
const MATERIAL_TOOLS = [
  "list_genre_cards",
  "get_genre_card",
  "list_craft_docs",
  "get_craft_doc",
  "get_preferences",
];
const SEMANTIC_TOOLS = ["semantic_search"];

// ---------- agent 工具清单 ----------
// 设计类（genre/architect/style/art）: 文件 + 素材库（查体裁卡/技法）
// narrative-weaver: + 叙事状态（伏笔规划时查现有伏笔）
// world/character-designer: + 语义检索 + 实体（设计时召回相关已有设定）
// story-designer: full + 语义 + 实体
// chapter-writer/editor: full + 叙事状态 + 实体（写章/审核时主动查伏笔/前文/角色态）
// consistency-checker: 文件 + 叙事状态 + 实体 + 语义（查闭合/一致性/语义召回）
const AGENT_TOOL_MAP: Record<AgentType, string[]> = {
  "genre-analyst": [...FILE_TOOLS, ...MATERIAL_TOOLS],
  architect: [...FILE_TOOLS, ...MATERIAL_TOOLS],
  "style-designer": [...FILE_TOOLS, ...MATERIAL_TOOLS],
  "art-director": [...FILE_TOOLS, ...MATERIAL_TOOLS],
  "narrative-weaver": [...FILE_TOOLS, ...MATERIAL_TOOLS, ...NARRATIVE_TOOLS],
  "world-builder": [...FILE_TOOLS, ...SEMANTIC_TOOLS, ...ENTITY_TOOLS],
  "character-designer": [...FILE_TOOLS, ...SEMANTIC_TOOLS, ...ENTITY_TOOLS],
  "story-designer": [...CHAPTER_FULL_TOOLS, ...SEMANTIC_TOOLS, ...ENTITY_TOOLS],
  "chapter-writer": [...CHAPTER_FULL_TOOLS, ...NARRATIVE_TOOLS, ...ENTITY_TOOLS],
  editor: [...CHAPTER_FULL_TOOLS, ...NARRATIVE_TOOLS, ...ENTITY_TOOLS],
  "consistency-checker": [...FILE_TOOLS, ...NARRATIVE_TOOLS, ...ENTITY_TOOLS, ...SEMANTIC_TOOLS],
};

for (const [agent, tools] of Object.entries(AGENT_TOOL_MAP)) {
  toolRegistry.registerAgentTools(agent as AgentType, tools);
}

// ---------- chat 助手工具清单（非 AgentType，单独导出） ----------
// 文件 + 章节 + 记忆 + 建书 + 全量只读查询（叙事状态/实体/素材/语义检索）
export const CHAT_TOOLS = [
  ...FILE_TOOLS,
  "read_chapter",
  "edit_chapter",
  "list_chapters",
  "save_memory",
  "create_novel",
  ...NARRATIVE_TOOLS,
  ...ENTITY_TOOLS,
  ...MATERIAL_TOOLS,
  ...SEMANTIC_TOOLS,
];

export { toolRegistry };
export type { FictiaTool, ToolContext, ToolTier, ToolFactory } from "./types.js";
