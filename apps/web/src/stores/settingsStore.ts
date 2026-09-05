import { create } from "zustand";
import type { AgentType, AgentModelAssignment, ProviderInfo, ReviewPolicy } from "@fictia/shared";
import { DEFAULT_AGENT_MODELS, DEFAULT_CHAT_MODEL, DEFAULT_SYSTEM_MODEL } from "@fictia/shared";

interface SettingsState {
  providers: ProviderInfo[];
  agentModels: Record<AgentType, AgentModelAssignment>;
  chatPersona: string;
  chatModel: AgentModelAssignment;
  systemModel: AgentModelAssignment;
  embeddingProvider: "glm" | "bge-m3";
  embeddingModelDir: string;
  embeddingApiKey: string;
  agentMaxTurns: number;
  reviewFixRounds: number;
  reviewPolicy: ReviewPolicy;
  setProviders: (providers: ProviderInfo[]) => void;
  upsertProvider: (provider: ProviderInfo) => void;
  removeProvider: (id: string) => void;
  setAgentModel: (agentType: AgentType, providerId: string, modelId: string) => void;
  setChatPersona: (p: string) => void;
  setChatModel: (providerId: string, modelId: string) => void;
  setSystemModel: (providerId: string, modelId: string) => void;
  setEmbeddingProvider: (p: "glm" | "bge-m3") => void;
  setEmbeddingModelDir: (dir: string) => void;
  setEmbeddingApiKey: (key: string) => void;
  setAgentMaxTurns: (n: number) => void;
  setReviewFixRounds: (n: number) => void;
  setReviewPolicy: (p: ReviewPolicy) => void;
  loadSettings: (settings: {
    agentModels: Record<AgentType, AgentModelAssignment>;
    chatPersona: string;
    chatModel: AgentModelAssignment;
    systemModel: AgentModelAssignment;
    embeddingProvider: "glm" | "bge-m3";
    embeddingModelDir: string;
    embeddingApiKey: string;
    agentMaxTurns: number;
    reviewFixRounds: number;
    reviewPolicy: ReviewPolicy;
  }) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  providers: [],
  agentModels: { ...DEFAULT_AGENT_MODELS },
  chatPersona: "",
  chatModel: { ...DEFAULT_CHAT_MODEL },
  systemModel: { ...DEFAULT_SYSTEM_MODEL },
  embeddingProvider: "glm",
  embeddingModelDir: "",
  embeddingApiKey: "",
  agentMaxTurns: 30,
  reviewFixRounds: 3,
  reviewPolicy: { passGrade: "B", severeHardFail: 3 },

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
  setSystemModel: (providerId, modelId) => set({ systemModel: { providerId, modelId } }),
  setEmbeddingProvider: (p) => set({ embeddingProvider: p }),
  setEmbeddingModelDir: (dir) => set({ embeddingModelDir: dir }),
  setEmbeddingApiKey: (key) => set({ embeddingApiKey: key }),
  setAgentMaxTurns: (n) => set({ agentMaxTurns: n }),
  setReviewFixRounds: (n) => set({ reviewFixRounds: n }),
  setReviewPolicy: (p) => set({ reviewPolicy: p }),

  loadSettings: (settings) => set(settings),
}));
