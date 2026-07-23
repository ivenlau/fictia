import { api } from "./client";
import type { ProviderInfo, ModelInfo } from "@fictia/shared";

export const providersApi = {
  list: () => api.get<ProviderInfo[]>("/providers"),
  usable: () => api.get<ProviderInfo[]>("/providers/usable"),
  create: (data: {
    name: string;
    baseUrl: string;
    apiFormat?: string;
    apiKey?: string;
    enabled?: boolean;
  }) => api.post<ProviderInfo>("/providers", data),
  update: (
    id: string,
    data: Partial<{
      name: string;
      baseUrl: string;
      apiFormat: string;
      apiKey: string;
      enabled: boolean;
    }>,
  ) => api.patch<ProviderInfo>(`/providers/${id}`, data),
  remove: (id: string) => api.delete<{ ok: boolean }>(`/providers/${id}`),
  test: (id: string, apiKey?: string) =>
    api.post<{ ok: boolean; error?: string }>(`/providers/${id}/test`, { apiKey }),
  addModel: (
    providerId: string,
    data: {
      id?: string;
      name: string;
      contextWindow?: number;
      maxTokens?: number;
      reasoning?: boolean;
      enabled?: boolean;
    },
  ) => api.post<ModelInfo>(`/providers/${providerId}/models`, data),
  updateModel: (
    providerId: string,
    modelId: string,
    data: Partial<{
      name: string;
      contextWindow: number;
      maxTokens: number;
      reasoning: boolean;
      enabled: boolean;
    }>,
  ) => api.patch<ModelInfo>(`/providers/${providerId}/models/${modelId}`, data),
  removeModel: (providerId: string, modelId: string) =>
    api.delete<{ ok: boolean }>(`/providers/${providerId}/models/${modelId}`),
  resetModels: (id: string) => api.post<ProviderInfo>(`/providers/${id}/reset-models`, {}),
};
