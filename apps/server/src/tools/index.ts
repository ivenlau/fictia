/**
 * 工具平台入口：注册所有工具工厂 + 各 agent 的工具清单。
 *
 * 被任一使用工具的模块 import 即触发注册（agents/index.ts import）。
 * agent 工具清单替代原 BaseAgent.getToolTier() 的二分，显式声明工具名，
 * 按角色分配只读查询工具（叙事状态/实体/素材/语义检索）+ 写入/触发工具。
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
import { createStateWriteTools } from "./state-write-tools.js";
import { createTriggerTools } from "./trigger-tools.js";
import { createOrchestrationTools } from "./orchestration-tools.js";
import { createTodoTools } from "./todo-tools.js";

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
toolRegistry.registerFactory(createStateWriteTools);
toolRegistry.registerFactory(createTriggerTools);
toolRegistry.registerFactory(createOrchestrationTools);
toolRegistry.registerFactory(createTodoTools);

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
  "list_reference_works",
  "get_reference_fingerprint",
  "get_reference_genre",
  "get_reference_craft",
];
/** craft 查询工具：给引用 craft 但不需要全 MATERIAL_TOOLS（体裁卡/偏好/参考作品）的 agent 用。
 *  避免这些 agent 因查 craft 而误用 read_file 读 references/writing-craft/ 路径（报错）。 */
const CRAFT_QUERY_TOOLS = ["list_craft_docs", "get_craft_doc"];
const SEMANTIC_TOOLS = ["semantic_search"];
/** 状态手动推进（write）：伏笔状态机 + 角色状态。 */
const STATE_WRITE_TOOLS = ["update_foreshadow_state", "update_character_state"];
/** 触发类（write）：摘要生成 + 实体重建 + 向量重建。 */
const TRIGGER_TOOLS = ["generate_chapter_summary", "index_entities", "index_vectors"];
/** 编排类（orchestrate）：查下一章 + 写作循环 + 流水线阶段。嵌套 agent，长耗时。 */
const ORCHESTRATION_TOOLS = ["find_next_chapter", "run_writing_loop", "run_pipeline_stage"];

// ---------- agent 工具清单 ----------
// 设计类（genre/architect/style/art）: 文件 + 素材库（查体裁卡/技法）
// narrative-weaver: + 叙事状态（伏笔规划时查现有伏笔）
// world/character-designer: + 语义检索 + 实体（设计时召回相关已有设定）
// story-designer: full + 语义 + 实体 + 叙事状态（重设计时查实际进度）
// chapter-writer: full + 叙事状态 + 实体（写章时主动查伏笔/前文/角色态）
// editor: + 状态手动推进（修正伏笔/角色状态）
// consistency-checker: 文件 + 叙事状态 + 实体 + 语义 + 伏笔修正 + 实体重建
const AGENT_TOOL_MAP: Record<AgentType, string[]> = {
  "genre-analyst": [...FILE_TOOLS, ...MATERIAL_TOOLS],
  architect: [...FILE_TOOLS, ...MATERIAL_TOOLS],
  "style-designer": [...FILE_TOOLS, ...MATERIAL_TOOLS],
  "art-director": [...FILE_TOOLS, ...MATERIAL_TOOLS],
  "narrative-weaver": ["todo", ...FILE_TOOLS, ...MATERIAL_TOOLS, ...NARRATIVE_TOOLS],
  "world-builder": [...FILE_TOOLS, ...SEMANTIC_TOOLS, ...ENTITY_TOOLS],
  "character-designer": [...CRAFT_QUERY_TOOLS, ...FILE_TOOLS, ...SEMANTIC_TOOLS, ...ENTITY_TOOLS],
  "story-designer": ["todo", ...CRAFT_QUERY_TOOLS, ...CHAPTER_FULL_TOOLS, ...SEMANTIC_TOOLS, ...ENTITY_TOOLS, ...NARRATIVE_TOOLS],
  "chapter-writer": ["todo", ...CRAFT_QUERY_TOOLS, ...CHAPTER_FULL_TOOLS, ...NARRATIVE_TOOLS, ...ENTITY_TOOLS],
  editor: [...CRAFT_QUERY_TOOLS, ...CHAPTER_FULL_TOOLS, ...NARRATIVE_TOOLS, ...ENTITY_TOOLS, ...STATE_WRITE_TOOLS],
  "consistency-checker": [
    "todo",
    ...FILE_TOOLS,
    ...NARRATIVE_TOOLS,
    ...ENTITY_TOOLS,
    ...SEMANTIC_TOOLS,
    "update_foreshadow_state",
    "index_entities",
  ],
};

for (const [agent, tools] of Object.entries(AGENT_TOOL_MAP)) {
  toolRegistry.registerAgentTools(agent as AgentType, tools);
}

// ---------- chat 助手工具清单（非 AgentType，单独导出） ----------
// 文件 + 章节 + 记忆 + 建书 + 全量只读查询 + 状态推进 + 触发
export const CHAT_TOOLS = [
  "todo",
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
  ...STATE_WRITE_TOOLS,
  ...TRIGGER_TOOLS,
  ...ORCHESTRATION_TOOLS,
];

export { toolRegistry };
export type { FictiaTool, ToolContext, ToolTier, ToolFactory } from "./types.js";
