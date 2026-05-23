import { create } from "zustand";
import type { AgentType } from "@fictia/shared";
import { DEFAULT_AGENT_MODELS } from "@fictia/shared";

interface SettingsState {
  apiKeyGlm: string;
  apiKeyMinimax: string;
  apiKeyDoubao: string;
  agentModels: Record<AgentType, { provider: string; model: string }>;
  setApiKey: (provider: "glm" | "minimax" | "doubao", key: string) => void;
  setAgentModel: (agentType: AgentType, provider: string, model: string) => void;
  loadSettings: (settings: { apiKeyGlm: string; apiKeyMinimax: string; apiKeyDoubao: string; agentModels: Record<AgentType, { provider: string; model: string }> }) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  apiKeyGlm: "",
  apiKeyMinimax: "",
  apiKeyDoubao: "",
  agentModels: { ...DEFAULT_AGENT_MODELS },
  setApiKey: (provider, key) =>
    set((s) => ({ ...s, [`apiKey${provider.charAt(0).toUpperCase() + provider.slice(1)}`]: key })),
  setAgentModel: (agentType, provider, model) =>
    set((s) => ({
      agentModels: { ...s.agentModels, [agentType]: { provider, model } },
    })),
  loadSettings: (settings) => set(settings),
}));
