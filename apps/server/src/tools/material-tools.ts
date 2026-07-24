/**
 * 素材库查询工具（D 类，只读）。
 * 暴露内置 + 用户自定义素材：体裁卡 / 写作技法 / 创作偏好。
 * 设计类 agent（genre-analyst/architect/style-designer 等）和 chat 助手按需查。
 */
import { Type } from "@earendil-works/pi-ai";
import { listGenreCards, listCraftDocs } from "../utils/material-catalog.js";
import { listUserMaterials, getUserMaterial, readPreferences } from "../utils/user-materials.js";
import type { FictiaTool, ToolContext } from "./types.js";

export function createMaterialTools(ctx: ToolContext): FictiaTool[] {
  return [
    {
      name: "list_genre_cards",
      label: "列出体裁卡",
      tier: "readonly",
      description: "列出所有可用体裁卡（内置 + 用户自定义）。设计/分析时参考体裁打法。",
      parameters: Type.Object({}),
      async execute() {
        const builtin = await listGenreCards();
        const custom = await listUserMaterials(ctx.novelDir, "genre-card");
        const lines: string[] = [];
        for (const c of builtin) lines.push(`- ${c.key}: ${c.name} (内置)${c.description ? " - " + c.description : ""}`);
        for (const c of custom) lines.push(`- ${c.key}: ${c.name} (自定义${c.enabled ? "" : ", 已禁用"})${c.description ? " - " + c.description : ""}`);
        const text = lines.length ? `体裁卡:\n${lines.join("\n")}` : "无体裁卡";
        return { content: [{ type: "text", text }], details: { builtin: builtin.length, custom: custom.length } };
      },
    },
    {
      name: "get_genre_card",
      label: "获取体裁卡内容",
      tier: "readonly",
      description: "获取某张体裁卡的完整内容。用户自定义优先（覆盖内置）。",
      parameters: Type.Object({
        key: Type.String({ description: "体裁卡 key（文件名，如 xianxia）" }),
      }),
      async execute(_id, { key }) {
        const custom = await getUserMaterial(ctx.novelDir, "genre-card", key as string);
        if (custom) return { content: [{ type: "text", text: custom.content }], details: { source: "user", key } };
        const builtin = (await listGenreCards()).find((c) => c.key === (key as string));
        if (builtin) return { content: [{ type: "text", text: builtin.content }], details: { source: "built-in", key } };
        throw new Error(`未找到体裁卡: ${key}`);
      },
    },
    {
      name: "list_craft_docs",
      label: "列出写作技法",
      tier: "readonly",
      description: "列出所有写作技法文档（内置 + 用户自定义）。",
      parameters: Type.Object({}),
      async execute() {
        const builtin = await listCraftDocs();
        const custom = await listUserMaterials(ctx.novelDir, "craft");
        const lines: string[] = [];
        for (const c of builtin) lines.push(`- ${c.key}: ${c.name} (内置)${c.description ? " - " + c.description : ""}`);
        for (const c of custom) lines.push(`- ${c.key}: ${c.name} (自定义${c.enabled ? "" : ", 已禁用"}${c.agents ? ", agents: " + c.agents.join(",") : ""})`);
        const text = lines.length ? `写作技法:\n${lines.join("\n")}` : "无写作技法";
        return { content: [{ type: "text", text }], details: { builtin: builtin.length, custom: custom.length } };
      },
    },
    {
      name: "get_craft_doc",
      label: "获取写作技法内容",
      tier: "readonly",
      description: "获取某篇写作技法文档的完整内容。用户自定义优先。",
      parameters: Type.Object({
        key: Type.String({ description: "技法 key（文件名）" }),
      }),
      async execute(_id, { key }) {
        const custom = await getUserMaterial(ctx.novelDir, "craft", key as string);
        if (custom) return { content: [{ type: "text", text: custom.content }], details: { source: "user", key } };
        const builtin = (await listCraftDocs()).find((c) => c.key === (key as string));
        if (builtin) return { content: [{ type: "text", text: builtin.content }], details: { source: "built-in", key } };
        throw new Error(`未找到写作技法: ${key}`);
      },
    },
    {
      name: "get_preferences",
      label: "获取创作偏好",
      tier: "readonly",
      description: "读取作者的创作偏好（常驻指令，materials/prompts/preferences.md）。",
      parameters: Type.Object({}),
      async execute() {
        const prefs = await readPreferences(ctx.novelDir);
        if (!prefs) return { content: [{ type: "text", text: "尚未创建创作偏好" }], details: { enabled: false } };
        const text = `创作偏好（${prefs.enabled ? "已启用" : "已禁用"}）:\n${prefs.content}`;
        return { content: [{ type: "text", text }], details: { enabled: prefs.enabled } };
      },
    },
  ];
}
