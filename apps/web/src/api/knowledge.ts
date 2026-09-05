/**
 * 知识库 API：向量检索 / 实体 / 知识图谱。
 * 所有端点按 novel scope 隔离（路径参数 novelId）。
 *
 * 注意：POST /novels/:novelId/vector/index 返回 SSE 流，不能用 api.post（它会 res.json()），
 * 故 runVectorIndex 走 fetch + 复用 writing-loop 的 consumeSse。
 */
import { api } from "./client";
import { consumeSse, type WritingLoopEvent } from "./writing-loop";

const BASE_URL = "/api";

// ---------- collections ----------

export type VectorCollection =
  | "chapters"
  | "design"
  | "world"
  | "outlines"
  | "notes"
  | "sources";

export type EntityCollection =
  | "characters"
  | "foreshadowing"
  | "storylines"
  | "timeline"
  | "locations"
  | "items"
  | "events"
  | "easter_eggs";

/** 实际会被索引的向量 collection（notes/sources 无子系统，后端 P3 需要时再加回）。 */
export const INDEXED_VECTOR_COLLECTIONS: VectorCollection[] = [
  "chapters",
  "design",
  "world",
  "outlines",
];

export const ENTITY_COLLECTIONS: EntityCollection[] = [
  "characters",
  "foreshadowing",
  "storylines",
  "timeline",
  "locations",
  "items",
  "events",
  "easter_eggs",
];

// ---------- types ----------

export interface VectorSearchHit {
  id: string;
  score: number;
  text: string;
  metadata: Record<string, unknown> & { path?: string };
}

export interface VectorSearchResponse {
  query: string;
  collection: string;
  hits: VectorSearchHit[];
}

export interface CollectionStats {
  [collection: string]: number;
}

export interface VectorIndexMetaInfo {
  version: number;
  provider: string;
  modelDir?: string;
  dtype?: string;
  chunkChars: number;
  chunkOverlap: number;
}

export interface VectorStatusResponse {
  novelId: string;
  collections: CollectionStats;
  indexMeta?: VectorIndexMetaInfo | null;
}

export interface VectorIndexResult {
  indexed: Record<string, number>;
  skipped?: Record<string, number>;
  fullRebuild?: boolean;
}

export interface Entity {
  collection: string;
  id: string;
  name: string;
  state: string;
  fields: Record<string, unknown>;
}

export interface EntitySearchResponse {
  query: string;
  collection: string;
  entities: Entity[];
}

export interface EntityListResponse {
  novelId: string;
  collection: string;
  entities: Entity[];
}

export interface EntityStatusResponse {
  novelId: string;
  collections: CollectionStats;
}

export interface EntityIndexResult {
  indexed?: Record<string, number>;
  [key: string]: unknown;
}

export interface GraphNode {
  id: string;
  name: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  rel_type: string;
  text: string;
  chapter?: number | null;
}

export interface GraphExport {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphStatus {
  novelId: string;
  relations: number;
  types: Record<string, number>;
}

export interface GraphBuildResult {
  relations_added?: number;
  [key: string]: unknown;
}

// ---------- 伏笔状态机 + 上下文注入预览 ----------

export type ForeshadowState = "planted" | "strengthened" | "resolved" | "suspended";

export interface ForeshadowStats {
  total: number;
  planted: number;
  strengthened: number;
  resolved: number;
  suspended: number;
  closureRate: number; // 0..1
  open: Array<{ id: string; name: string; state: ForeshadowState; desc?: string }>;
}

export interface ContextPreviewSectionItem {
  key: string;
  title: string;
  present: boolean;
  charCount: number;
  detail: string;
}

export interface ContextPreview {
  novelId: string;
  chapter: number;
  sections: ContextPreviewSectionItem[];
  raw: string;
}

// ---------- json endpoints ----------

export const knowledgeApi = {
  // 向量
  vectorSearch: (
    novelId: string,
    q: string,
    collection = "chapters",
    topK = 5,
  ) =>
    api.get<VectorSearchResponse>(
      `/novels/${novelId}/search?q=${encodeURIComponent(q)}&collection=${collection}&topK=${topK}`,
    ),
  vectorStatus: (novelId: string) =>
    api.get<VectorStatusResponse>(`/novels/${novelId}/vector/status`),

  // 实体
  entitySearch: (novelId: string, q: string, collection?: EntityCollection) =>
    api.get<EntitySearchResponse>(
      `/novels/${novelId}/entity/search?q=${encodeURIComponent(q)}${
        collection ? `&collection=${collection}` : ""
      }`,
    ),
  entityList: (novelId: string, collection?: EntityCollection) =>
    api.get<EntityListResponse>(
      `/novels/${novelId}/entity/list${collection ? `?collection=${collection}` : ""}`,
    ),
  entityStatus: (novelId: string) =>
    api.get<EntityStatusResponse>(`/novels/${novelId}/entity/status`),
  entityIndex: (novelId: string) =>
    api.post<EntityIndexResult>(`/novels/${novelId}/entity/index`),

  // 知识图谱
  graphBuild: (novelId: string) =>
    api.post<GraphBuildResult>(`/novels/${novelId}/graph/build`),
  graphStatus: (novelId: string) =>
    api.get<GraphStatus>(`/novels/${novelId}/graph/status`),
  graphExport: (novelId: string) =>
    api.get<GraphExport>(`/novels/${novelId}/graph/export`),

  // 伏笔状态机 + 上下文注入预览
  foreshadowStats: (novelId: string) =>
    api.get<ForeshadowStats>(`/novels/${novelId}/foreshadowing/stats`),
  contextPreview: (novelId: string, chapter: number) =>
    api.get<ContextPreview>(`/novels/${novelId}/context-preview?chapter=${chapter}`),
  chapterSummaries: (novelId: string) =>
    api.get<{ novelId: string; summaries: Record<string, string> }>(
      `/novels/${novelId}/chapter-summaries`,
    ),
};

// ---------- SSE: 向量索引（默认增量，force=true 全量重建）----------

export type VectorIndexEvent = WritingLoopEvent;

export async function runVectorIndex(
  novelId: string,
  onEvent: (e: VectorIndexEvent) => void,
  options?: { force?: boolean },
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/novels/${novelId}/vector/index`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ force: options?.force ?? false }),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  await consumeSse(res, onEvent);
}
