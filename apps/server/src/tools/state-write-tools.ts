/**
 * 状态手动推进工具（F1，write tier）。
 *
 * 现状：伏笔/角色状态只能从章节"写作备注"自动解析（updateEntitiesFromChapterNotes），
 * 不能手动修正。这两个工具让 editor/consistency-checker/chat 手动推进状态机，
 * 用于修正自动解析遗漏或补充备注外的状态变化。
 *
 * 伏笔走 transitionForeshadow 状态机校验（禁止回退，如已回收不能再埋设）；
 * 角色直接更新 state 字段（可选追加 stateHistory）。
 */
import { Type } from "@earendil-works/pi-ai";
import {
  transitionForeshadow,
  type ForeshadowState,
  type ForeshadowHistoryEntry,
} from "@fictia/shared";
import { getEntity, upsertEntities } from "../services/entity-store.js";
import type { FictiaTool, ToolContext } from "./types.js";

export function createStateWriteTools(ctx: ToolContext): FictiaTool[] {
  return [
    {
      name: "update_foreshadow_state",
      label: "推进伏笔状态",
      tier: "write",
      description:
        "手动推进伏笔状态机。操作 op：埋设/推进/强化/回收/悬置。走状态机校验，禁止回退（如已回收不能再埋设）。用于修正自动解析遗漏或错误的伏笔状态。",
      parameters: Type.Object({
        foreshadow_id: Type.String({ description: "伏笔编号，如 FO-001" }),
        op: Type.String({ description: "操作关键字：埋设/推进/强化/回收/悬置" }),
        chapter: Type.Number({ description: "发生的章节号" }),
        note: Type.Optional(Type.String({ description: "可选备注" })),
      }),
      async execute(_id, { foreshadow_id, op, chapter, note }) {
        const e = getEntity(ctx.novelId, "foreshadowing", foreshadow_id as string);
        if (!e) throw new Error(`未找到伏笔: ${foreshadow_id}`);
        const cur = (e.state as ForeshadowState) || "planted";
        const next = transitionForeshadow(cur, op as string);
        if (!next) {
          throw new Error(
            `状态机拒绝: 伏笔 ${foreshadow_id} 当前状态 ${cur}，操作「${op}」非法（可能回退或未知操作）`,
          );
        }
        const chTag = `ch${String(chapter).padStart(2, "0")}`;
        const history = Array.isArray(e.fields.history)
          ? [...(e.fields.history as ForeshadowHistoryEntry[])]
          : [];
        const entry: ForeshadowHistoryEntry = { ch: chTag, op: op as string, state: next };
        if (note) entry.note = note as string;
        history.push(entry);
        const fields: Record<string, unknown> = { ...e.fields, history };
        if (next === "planted" && !fields.plantedCh) fields.plantedCh = chTag;
        if (next === "strengthened") {
          const arr = Array.isArray(fields.strengthenChs) ? [...(fields.strengthenChs as string[])] : [];
          if (!arr.includes(chTag)) arr.push(chTag);
          fields.strengthenChs = arr;
        }
        if (next === "resolved") fields.resolvedCh = chTag;
        upsertEntities(ctx.novelId, [{ ...e, state: next, fields }]);
        return {
          content: [{ type: "text", text: `伏笔 ${foreshadow_id}（${e.name}）状态: ${cur} -> ${next}（第${chapter}章 ${op}）` }],
          details: { foreshadow_id, from: cur, to: next },
        };
      },
    },
    {
      name: "update_character_state",
      label: "更新角色状态",
      tier: "write",
      description:
        "手动更新角色当前状态（情绪/位置/关系等变化）。用于修正自动解析遗漏或补充章节备注外的状态变化。",
      parameters: Type.Object({
        character_id: Type.String({ description: "角色 id（通常为角色名，可用 search_entities 查）" }),
        state: Type.String({ description: "新的状态描述（简短，如 '重伤潜伏'、'与主角决裂'）" }),
        chapter: Type.Optional(Type.Number({ description: "发生章节号（可选，记录到 stateHistory）" })),
      }),
      async execute(_id, { character_id, state, chapter }) {
        const e = getEntity(ctx.novelId, "characters", character_id as string);
        if (!e) throw new Error(`未找到角色: ${character_id}`);
        const oldState = e.state;
        const fields: Record<string, unknown> = { ...e.fields };
        if (chapter) {
          const hist = Array.isArray(fields.stateHistory)
            ? [...(fields.stateHistory as Array<{ ch: string; state: string }>)]
            : [];
          hist.push({ ch: `ch${String(chapter).padStart(2, "0")}`, state: state as string });
          fields.stateHistory = hist;
        }
        upsertEntities(ctx.novelId, [{ ...e, state: state as string, fields }]);
        return {
          content: [{ type: "text", text: `角色 ${character_id}（${e.name}）状态: ${oldState || "(空)"} -> ${state}` }],
          details: { character_id, from: oldState, to: state },
        };
      },
    },
  ];
}
