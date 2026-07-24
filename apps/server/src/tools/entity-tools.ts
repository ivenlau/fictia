/**
 * 实体/知识图谱查询工具（B 类，只读）。
 * 暴露 entities.db 的实体检索 + 关系图谱：search/get/neighbors/stats。
 * 设计/审核/一致性检查时主动查角色/伏笔/支线/关系，替代翻文件。
 */
import { Type } from "@earendil-works/pi-ai";
import {
  searchEntities,
  getEntity,
  getNeighbors,
  entityStats,
} from "../services/entity-store.js";
import type { FictiaTool, ToolContext } from "./types.js";

export function createEntityTools(ctx: ToolContext): FictiaTool[] {
  return [
    {
      name: "search_entities",
      label: "搜索实体",
      tier: "readonly",
      description:
        "按名字或内容模糊搜索实体（角色/伏笔/支线/时间线等）。可按 collection 过滤。返回匹配实体列表。",
      parameters: Type.Object({
        query: Type.String({ description: "搜索关键词（匹配 name 或 fields）" }),
        collection: Type.Optional(
          Type.String({
            description: "实体集合：characters/foreshadowing/storylines/timeline/locations/items/events/easter_eggs",
          }),
        ),
      }),
      async execute(_id, { query, collection }) {
        const results = searchEntities(ctx.novelId, query as string, collection as string | undefined);
        if (results.length === 0) {
          return { content: [{ type: "text", text: `未找到匹配 "${query}" 的实体` }], details: { count: 0 } };
        }
        const text = `找到 ${results.length} 个实体:\n${results
          .map((e) => `- [${e.collection}] ${e.id}: ${e.name} (state: ${e.state})`)
          .join("\n")}`;
        return { content: [{ type: "text", text }], details: { count: results.length } };
      },
    },
    {
      name: "get_entity",
      label: "获取实体详情",
      tier: "readonly",
      description: "获取单个实体的完整详情（含 fields 全部字段）。需指定 collection 和 id。",
      parameters: Type.Object({
        collection: Type.String({ description: "实体集合，如 characters/foreshadowing/storylines" }),
        id: Type.String({ description: "实体 id" }),
      }),
      async execute(_id, { collection, id }) {
        const e = getEntity(ctx.novelId, collection as string, id as string);
        if (!e) throw new Error(`未找到实体: ${collection}/${id}`);
        const text = `实体: ${e.name} (${e.id})
集合: ${e.collection}
状态: ${e.state}

fields:
${JSON.stringify(e.fields, null, 2)}`;
        return { content: [{ type: "text", text }], details: e };
      },
    },
    {
      name: "get_entity_neighbors",
      label: "实体关系图谱",
      tier: "readonly",
      description:
        "查询某实体在知识图谱中的邻居（角色关系等）。返回出入边、关系类型、所在章节。",
      parameters: Type.Object({
        entity_id: Type.String({ description: "实体 id" }),
        rel_type: Type.Optional(
          Type.String({ description: "关系类型过滤，如 mentor/friend/enemy/lover/family/ally" }),
        ),
      }),
      async execute(_id, { entity_id, rel_type }) {
        const neighbors = getNeighbors(ctx.novelId, entity_id as string, rel_type as string | undefined);
        if (neighbors.length === 0) {
          return { content: [{ type: "text", text: `实体 ${entity_id} 无图谱邻居` }], details: { count: 0 } };
        }
        const text = `实体 ${entity_id} 的图谱邻居:\n${neighbors
          .map((n) => `- [${n.direction}] ${n.entity_id} (${n.rel_type})${n.text ? ": " + n.text : ""}${n.chapter ? " @ch" + n.chapter : ""}`)
          .join("\n")}`;
        return { content: [{ type: "text", text }], details: { count: neighbors.length } };
      },
    },
    {
      name: "get_entity_stats",
      label: "实体统计",
      tier: "readonly",
      description: "统计各集合的实体数量（角色/伏笔/支线/时间线等）。",
      parameters: Type.Object({}),
      async execute() {
        const stats = entityStats(ctx.novelId);
        const text = `实体统计:\n${Object.entries(stats)
          .map(([k, v]) => `- ${k}: ${v}`)
          .join("\n")}`;
        return { content: [{ type: "text", text }], details: stats };
      },
    },
  ];
}
