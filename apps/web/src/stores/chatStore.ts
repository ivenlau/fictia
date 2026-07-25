import { create } from "zustand";
import type { ChatMessage } from "@fictia/shared";

interface ToolCallEntry {
  tool: string;
  input: string;
  result: string;
}

/** 工具确认请求（manualConfirm 开启时，write/orchestrate 工具执行前等用户确认）。 */
interface PendingConfirmation {
  callId: string;
  tool: string;
  input: string;
}

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  toolCalls: ToolCallEntry[];
  pendingConfirmation: PendingConfirmation | null;
  addMessage: (msg: ChatMessage) => void;
  appendToLast: (delta: string) => void;
  addToolCall: (tc: ToolCallEntry) => void;
  setStreaming: (v: boolean) => void;
  setPendingConfirmation: (p: PendingConfirmation | null) => void;
  loadHistory: (messages: ChatMessage[]) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isStreaming: false,
  toolCalls: [],
  pendingConfirmation: null,

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

  setPendingConfirmation: (p) => set({ pendingConfirmation: p }),

  loadHistory: (messages) => set({ messages }),

  clearMessages: () => set({ messages: [], toolCalls: [], pendingConfirmation: null }),
}));
