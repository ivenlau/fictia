import { api } from "./client";
import type { ChatMessage } from "@fictia/shared";

export const chatApi = {
  history: (novelId?: string) =>
    api.get<ChatMessage[]>(`/chat/history${novelId ? `?novelId=${novelId}` : ""}`),
  clearHistory: (novelId?: string) =>
    api.delete(`/chat/history${novelId ? `?novelId=${novelId}` : ""}`),
};
