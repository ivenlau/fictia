import { create } from "zustand";
import type { AgentType, AgentModelAssignment, ProviderInfo } from "@fictia/shared";
import { DEFAULT_AGENT_MODELS, DEFAULT_CHAT_MODEL } from "@fictia/shared";

interface SettingsState {
  providers: ProviderInfo[];
  agentModels: Record<AgentType, AgentModelAssignment>;
  chatPersona: string;
  chatModel: AgentModelAssignment;
  embeddingProvider: "glm" | "bge-m3";
  setProviders: (providers: ProviderInfo[]) => void;
  upsertProvider: (provider: ProviderInfo) => void;
  removeProvider: (id: string) => void;
  setAgentModel: (agentType: AgentType, providerId: string, modelId: string) => void;
  setChatPersona: (p: string) => void;
  setChatModel: (providerId: string, modelId: string) => void;
  setEmbeddingProvider: (p: "glm" | "bge-m3") => void;
  loadSettings: (settings: {
    agentModels: Record<AgentType, AgentModelAssignment>;
    chatPersona: string;
    chatModel: AgentModelAssignment;
    embeddingProvider: "glm" | "bge-m3";
  }) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  providers: [],
  agentModels: { ...DEFAULT_AGENT_MODELS },
  chatPersona: "",
  chatModel: { ...DEFAULT_CHAT_MODEL },
  embeddingProvider: "glm",

  setProviders: (providers) => set({ providers }),

  upsertProvider: (provider) =>
    set((s) => {
      const idx = s.providers.findIndex((p) => p.id === provider.id);
      if (idx >= 0) {
        const next = [...s.providers];
        next[idx] = provider;
        return { providers: next };
      }
      return { providers: [...s.providers, provider] };
    }),

  removeProvider: (id) =>
    set((s) => ({ providers: s.providers.filter((p) => p.id !== id) })),

  setAgentModel: (agentType, providerId, modelId) =>
    set((s) => ({
      agentModels: { ...s.agentModels, [agentType]: { providerId, modelId } },
    })),

  setChatPersona: (p) => set({ chatPersona: p }),
  setChatModel: (providerId, modelId) => set({ chatModel: { providerId, modelId } }),
  setEmbeddingProvider: (p) => set({ embeddingProvider: p }),

  loadSettings: (settings) => set(settings),
}));
