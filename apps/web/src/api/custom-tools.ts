import { api } from "./client";
import type { CustomToolDef, CustomToolKind, TestToolResult } from "@fictia/shared";

export const customToolsApi = {
  list: () => api.get<CustomToolDef[]>("/custom-tools"),
  get: (id: string) => api.get<CustomToolDef>(`/custom-tools/${id}`),
  create: (def: Omit<CustomToolDef, "id" | "createdAt" | "updatedAt">) =>
    api.post<CustomToolDef>("/custom-tools", def),
  update: (id: string, patch: Partial<CustomToolDef>) =>
    api.patch<CustomToolDef>(`/custom-tools/${id}`, patch),
  remove: (id: string) => api.delete<{ ok: boolean }>(`/custom-tools/${id}`),
  testById: (id: string, novelId: string, params: Record<string, unknown>) =>
    api.post<TestToolResult>(`/custom-tools/${id}/test`, { novelId, params }),
  testDef: (novelId: string, def: CustomToolDef, params: Record<string, unknown>) =>
    api.post<TestToolResult>("/custom-tools/test", { novelId, def, params }),
  generate: (description: string, preferKind?: CustomToolKind["kind"]) =>
    api.post<CustomToolDef>("/custom-tools/generate", { description, preferKind }),
};
