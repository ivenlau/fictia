/**
 * 素材库 API（块 1）：内置目录 + 注入预览。
 * 体裁卡选择走 novelsApi.setGenreCard（PATCH /novels/:id 写 meta.json.genreCard）。
 */
import { api } from "./client";

export type CatalogType = "genre-card" | "craft";

export interface CatalogEntry {
  key: string;
  name: string;
  description?: string;
  content: string;
  raw: string;
  source: "built-in";
}

export interface CatalogResponse {
  type: CatalogType;
  entries: CatalogEntry[];
}

export interface AgentsResponse {
  agents: string[];
}

export interface InjectionSection {
  key: "base" | "preferences" | "craft" | "style-guide";
  title: string;
  present: boolean;
  charCount: number;
  detail: string;
}

export interface InjectionPreview {
  agent: string;
  genre: string | null;
  genreCard: string | null;
  sections: InjectionSection[];
  assembledPrompt: string;
  totalChars: number;
}

export interface NovelMeta {
  genreCard?: string | null;
  genre?: string;
  [key: string]: unknown;
}

// ---------- 用户素材（块 2）----------

export type UserMaterialType = "genre-card" | "craft" | "prompt-snippet";

export interface UserMaterial {
  type: UserMaterialType;
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  agents?: string[];
  content: string;
  raw: string;
  scope: "novel";
  source: "user";
}

export interface UserMaterialInput {
  name?: string;
  description?: string;
  enabled?: boolean;
  agents?: string[];
  content?: string;
}

export interface Preferences {
  enabled: boolean;
  content: string;
}

export const materialsApi = {
  catalog: (type: CatalogType) =>
    api.get<CatalogResponse>(`/materials/catalog?type=${type}`),
  agents: () => api.get<AgentsResponse>(`/materials/agents`),
  injectionPreview: (novelId: string, agent: string) =>
    api.get<InjectionPreview>(
      `/novels/${novelId}/materials/injection-preview?agent=${encodeURIComponent(agent)}`,
    ),

  // 用户素材 CRUD
  listUserMaterials: (novelId: string, type: UserMaterialType) =>
    api.get<{ type: UserMaterialType; entries: UserMaterial[] }>(
      `/novels/${novelId}/materials?type=${type}`,
    ),
  createUserMaterial: (
    novelId: string,
    type: UserMaterialType,
    key: string,
    data: UserMaterialInput,
  ) =>
    api.post<UserMaterial>(`/novels/${novelId}/materials`, { type, key, ...data }),
  updateUserMaterial: (
    novelId: string,
    type: UserMaterialType,
    key: string,
    data: UserMaterialInput,
  ) => api.patch<UserMaterial>(`/novels/${novelId}/materials/${type}/${key}`, data),
  deleteUserMaterial: (novelId: string, type: UserMaterialType, key: string) =>
    api.delete<void>(`/novels/${novelId}/materials/${type}/${key}`),
  cloneBuiltin: (novelId: string, type: UserMaterialType, key: string) =>
    api.post<UserMaterial>(`/novels/${novelId}/materials/clone`, { type, key }),

  // C1 创作偏好
  getPreferences: (novelId: string) =>
    api.get<Preferences>(`/novels/${novelId}/materials/preferences`),
  setPreferences: (novelId: string, enabled: boolean, content: string) =>
    api.patch<Preferences>(`/novels/${novelId}/materials/preferences`, { enabled, content }),
};
