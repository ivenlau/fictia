import { api } from "./client";
import type { AgentOutput, AgentType } from "@fictia/shared";

export const agentsApi = {
  triggerNovelAgent: (novelId: string, agentType: AgentType, persona?: string) =>
    api.post<{ outputId: string }>(`/novels/${novelId}/agents/${agentType}/trigger`, { persona }),
  triggerChapterAgent: (chapterId: string, agentType: AgentType, persona?: string) =>
    api.post<{ outputId: string }>(`/chapters/${chapterId}/agents/${agentType}/trigger`, { persona }),
  getStatus: (outputId: string) => api.get<AgentOutput>(`/agents/${outputId}/status`),
  cancel: (outputId: string) => api.post(`/agents/${outputId}/cancel`),
  listOutputs: (novelId: string) => api.get<AgentOutput[]>(`/novels/${novelId}/agent-outputs`),
  getStreamUrl: (outputId: string) => `/api/agents/${outputId}/stream`,

  rewrite: (chapterId: string, params: { selectedText?: string; instruction: string; context?: string }) =>
    api.post<{ response: string; toolCalls: { tool: string; input: string }[]; updatedContent: string }>(
      `/chapters/${chapterId}/rewrite`,
      params,
    ),

  fileRewrite: (novelId: string, params: { filePath: string; selectedText?: string; instruction: string }) =>
    api.post<{ updatedContent: string }>(
      `/novels/${novelId}/file-rewrite`,
      params,
    ),
};
