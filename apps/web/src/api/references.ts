/**
 * 参考作品 API（对标 tab）：上传参考作品 → 后端同步解析为风格指纹 → 启用后注入。
 * 详见 /root/.claude/plans/hidden-percolating-cocoa.md。
 */
import { api } from "./client";
import type { UserMaterial } from "./materials";

export type ParseStatus = "pending" | "parsing" | "done" | "failed";
export type SourceFormat = "paste" | "txt" | "markdown" | "epub";

export interface ReferenceMeta {
  key: string;
  name: string;
  description: string;
  sourceFormat: SourceFormat;
  charCount: number;
  parsedAt: string | null;
  enabled: boolean;
  parseStatus: ParseStatus;
}

export interface ReferenceWork extends ReferenceMeta {
  fingerprint: string | null;
  genreCard: string | null;
  craft: string | null;
  hasSource: boolean;
}

export interface ParseResult {
  source: "llm" | "fallback";
  segments: number;
  samples: number;
  fingerprintChars: number;
  genreChars: number;
  craftChars: number;
}

export interface CreateReferencePayload {
  key: string;
  name?: string;
  sourceText: string;
  sourceFormat?: SourceFormat;
  description?: string;
}

export interface ParseResponse {
  work: ReferenceWork;
  parse: ParseResult;
}

export const referencesApi = {
  list: (novelId: string) =>
    api.get<{ entries: ReferenceMeta[] }>(`/novels/${novelId}/references`),
  get: (novelId: string, key: string) =>
    api.get<ReferenceWork>(`/novels/${novelId}/references/${key}`),
  /** 新建并同步解析（约 1-2 分钟）。 */
  create: (novelId: string, payload: CreateReferencePayload) =>
    api.post<ParseResponse>(`/novels/${novelId}/references`, payload),
  /** 重新解析（覆盖 fingerprint）。 */
  reparse: (novelId: string, key: string) =>
    api.post<ParseResponse>(`/novels/${novelId}/references/${key}/parse`),
  update: (
    novelId: string,
    key: string,
    data: { name?: string; description?: string; enabled?: boolean },
  ) => api.patch<ReferenceMeta>(`/novels/${novelId}/references/${key}`, data),
  remove: (novelId: string, key: string) =>
    api.delete<void>(`/novels/${novelId}/references/${key}`),
  adoptGenre: (novelId: string, key: string) =>
    api.post<UserMaterial>(`/novels/${novelId}/references/${key}/adopt-genre`),
};
