import { create } from "zustand";
import type { ChatMessage } from "@fictia/shared";

interface ToolCallEntry {
  tool: string;
  input: string;
  result: string;
}

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  selectedProviderId: string;
  selectedModelId: string;
  toolCalls: ToolCallEntry[];
  setModel: (providerId: string, modelId: string) => void;
  addMessage: (msg: ChatMessage) => void;
  appendToLast: (delta: string) => void;
  addToolCall: (tc: ToolCallEntry) => void;
  setStreaming: (v: boolean) => void;
  loadHistory: (messages: ChatMessage[]) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isStreaming: false,
  selectedProviderId: "",
  selectedModelId: "",
  toolCalls: [],

  setModel: (providerId, modelId) =>
    set({ selectedProviderId: providerId, selectedModelId: modelId }),

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  appendToLast: (delta) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, content: last.content + delta };
      }
      return { messages: msgs };
    }),

  addToolCall: (tc) => set((s) => ({ toolCalls: [...s.toolCalls, tc] })),

  setStreaming: (v) => {
    if (v) {
      set({ isStreaming: true, toolCalls: [] });
    } else {
      set({ isStreaming: false });
    }
  },

  loadHistory: (messages) => set({ messages }),

  clearMessages: () => set({ messages: [], toolCalls: [] }),
}));
