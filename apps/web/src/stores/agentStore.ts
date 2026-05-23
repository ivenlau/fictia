import { create } from "zustand";
import type { AgentOutput, AgentType, AgentStatus } from "@fictia/shared";

interface AgentState {
  outputs: AgentOutput[];
  runningAgents: Map<string, { type: AgentType; status: AgentStatus; progress: string }>;
  writingChapterId: string | null;
  autoGenerateActive: boolean;
  autoGeneratePaused: boolean;
  setOutputs: (outputs: AgentOutput[]) => void;
  addOutput: (output: AgentOutput) => void;
  updateOutput: (id: string, updates: Partial<AgentOutput>) => void;
  setAgentRunning: (id: string, type: AgentType, status: AgentStatus, progress?: string) => void;
  removeAgent: (id: string) => void;
  setWritingChapter: (chapterId: string | null) => void;
  setAutoGenerateActive: (active: boolean) => void;
  setAutoGeneratePaused: (paused: boolean) => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  outputs: [],
  runningAgents: new Map(),
  writingChapterId: null,
  autoGenerateActive: false,
  autoGeneratePaused: false,
  setOutputs: (outputs) => set({ outputs }),
  addOutput: (output) => set((s) => ({ outputs: [...s.outputs, output] })),
  updateOutput: (id, updates) =>
    set((s) => ({
      outputs: s.outputs.map((o) => (o.id === id ? { ...o, ...updates } : o)),
    })),
  setAgentRunning: (id, type, status, progress) =>
    set((s) => {
      const next = new Map(s.runningAgents);
      next.set(id, { type, status, progress: progress ?? "" });
      return { runningAgents: next };
    }),
  removeAgent: (id) =>
    set((s) => {
      const next = new Map(s.runningAgents);
      next.delete(id);
      return { runningAgents: next };
    }),
  setWritingChapter: (chapterId) => set({ writingChapterId: chapterId }),
  setAutoGenerateActive: (active) => set({ autoGenerateActive: active }),
  setAutoGeneratePaused: (paused) => set({ autoGeneratePaused: paused }),
}));
