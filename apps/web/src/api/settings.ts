import { api } from "./client";
import type { Settings } from "@fictia/shared";

export const settingsApi = {
  get: () => api.get<Settings>("/settings"),
  update: (data: Partial<Settings>) => api.patch<Settings>("/settings", data),
  testConnection: (provider: string, apiKey?: string) =>
    api.post<{ ok: boolean; error?: string }>("/settings/test-connection", { provider, apiKey }),
};
