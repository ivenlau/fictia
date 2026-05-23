import { api } from "./client";
import type { Novel, CreateNovelRequest, WorkspaceFile } from "@fictia/shared";

export interface SearchResult {
  type: "workspace" | "chapter";
  id: string;
  novelId: string;
  novelTitle: string;
  title: string;
  path: string;
  snippet: string;
}

export const novelsApi = {
  list: () => api.get<Novel[]>("/novels"),
  get: (id: string) => api.get<Novel>(`/novels/${id}`),
  create: (data: CreateNovelRequest) => api.post<Novel>("/novels", data),
  update: (id: string, data: Partial<Novel>) => api.patch<Novel>(`/novels/${id}`, data),
  reset: (id: string) => api.post<Novel>(`/novels/${id}/reset`),
  delete: (id: string) => api.delete<void>(`/novels/${id}`),
  getFiles: (id: string) => api.get<WorkspaceFile[]>(`/novels/${id}/files`),
  updateFile: (novelId: string, filePath: string, content: string) =>
    api.patch<WorkspaceFile>(`/novels/${novelId}/files/${encodeURIComponent(filePath)}`, { content }),
  search: (query: string) => api.get<SearchResult[]>(`/novels/search?q=${encodeURIComponent(query)}`),
};
