/**
 * 选一个可用的 LLM 模型：优先 systemModel（后台任务：参考作品解析 / 章节摘要），
 * 回退 chatModel，再回退首个 usable provider 的首个模型。无凭证/无可用返回 null。
 *
 * 供 summary-chain / reference-parse 等离线蒸馏管线共用。
 */
import type { Model } from "@earendil-works/pi-ai";
import type { AgentModelAssignment } from "@fictia/shared";
import { settingsService } from "./settings.service.js";
import { providerService } from "./provider.service.js";
import { buildModel } from "../llm/providers.js";

export interface PickedModel {
  model: Model<"openai-completions">;
  apiKey: string;
}

function tryResolve(pref: AgentModelAssignment): PickedModel | null {
  const resolved = providerService.resolveModel(pref.providerId, pref.modelId);
  if (!resolved || !resolved.provider.apiKey) return null;
  return { model: buildModel(resolved.provider, resolved.model), apiKey: resolved.provider.apiKey };
}

export function pickAvailableModel(): PickedModel | null {
  const { systemModel, chatModel } = settingsService.get();
  for (const pref of [systemModel, chatModel]) {
    const picked = tryResolve(pref);
    if (picked) return picked;
  }
  const usable = providerService.listUsable()[0];
  if (usable && usable.models[0]) {
    return tryResolve({ providerId: usable.id, modelId: usable.models[0].id });
  }
  return null;
}
