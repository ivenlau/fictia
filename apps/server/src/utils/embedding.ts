/**
 * Embedding：按 provider 分流。
 *   glm     -> 智谱 embedding-2 API（1024 维），需 API key。
 *   bge-m3  -> 本地 transformers.js（1024 维），无需 key。
 *
 * 两种 provider 都是 1024 维（EMBED_DIM 不变），但向量空间不同，
 * 切换 provider 后旧索引不可复用（由向量库的 index_meta 记录并校验）。
 *
 * 所有 provider 的出口统一做 L2 归一化：向量库 score 按「单位向量 L2² = 2-2cos」
 * 换算为余弦相似度，全链路必须保证单位向量（glm 返回值不保证，bge-m3/stub 已归一，
 * 再归一幂等无害）。
 */

import { createHash } from "crypto";
import type { EmbeddingProvider } from "@fictia/shared";
import { localEmbed } from "./local-embedder.js";

export const EMBED_DIM = 1024;
export type { EmbeddingProvider };
/** 别名，便于后端按习惯引用。 */
export type EmbedProvider = EmbeddingProvider;

const GLM_API_URL = "https://open.bigmodel.cn/api/paas/v4/embeddings";
const GLM_MODEL = "embedding-2";
// 智谱 embedding-2 单请求最多 64 条 input；切块后块数远超，需分批请求。
const GLM_BATCH = Math.max(1, Math.floor(Number(process.env.GLM_BATCH ?? 64)) || 64);
// 分批请求重试：429/5xx/网络错误指数退避，避免一批抖动导致整个索引失败。
const GLM_RETRIES = Math.max(0, Math.floor(Number(process.env.GLM_RETRIES ?? 3)) || 3);

export class EmbeddingError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** L2 归一化（零向量保护）。 */
function normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
  if (!norm) return vec;
  return vec.map((x) => x / norm);
}

/** 429/5xx/网络错误可重试；其余（4xx 参数错等）直接失败。 */
function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

async function fetchWithRetry(
  batch: string[],
  apiKey: string,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= GLM_RETRIES; attempt++) {
    try {
      const resp = await fetch(GLM_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: GLM_MODEL, input: batch }),
      });
      if (resp.ok || !isRetryable(resp.status)) return resp;
      lastErr = new Error(`HTTP ${resp.status}`);
      // 耗尽最后一次：原样返回，让调用方抛出带响应体细节的错误
      if (attempt === GLM_RETRIES) return resp;
    } catch (e) {
      lastErr = e; // 网络错误（ECONNRESET/超时等）
    }
    await sleep(1000 * 2 ** attempt); // 1s / 2s / 4s
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** 智谱 embedding-2 批量嵌入。按 GLM_BATCH 分批顺序请求（单请求上限 64 条 input）。 */
async function embedGlm(texts: string[], apiKey: string): Promise<number[][]> {
  if (!apiKey) throw new EmbeddingError("未配置 GLM API Key（请在「设置 → 模型提供商」中配置 GLM）");

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += GLM_BATCH) {
    const batch = texts.slice(i, i + GLM_BATCH);
    const resp = await fetchWithRetry(batch, apiKey);

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      throw new EmbeddingError(`智谱 embedding API 失败 ${resp.status}: ${detail.slice(0, 200)}`);
    }

    const data = (await resp.json()) as { data: { embedding: number[] }[] };
    // 数量不匹配会导致向量与文本错位、污染检索，必须显式拦截
    if (data.data.length !== batch.length) {
      throw new EmbeddingError(
        `智谱 embedding 返回数量不匹配（期望 ${batch.length}，实际 ${data.data.length}）`,
      );
    }
    for (const item of data.data) out.push(normalize(item.embedding));
  }
  return out;
}

/**
 * 批量嵌入：glm 走智谱 API，bge-m3 走本地 transformers.js。
 * 出口统一 L2 归一化（幂等），保证向量库 score 换算余弦相似度成立。
 */
export async function embed(
  texts: string[],
  provider: EmbeddingProvider,
  glmKey: string,
  modelDir?: string,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const vecs = provider === "bge-m3" ? await localEmbed(texts, modelDir) : await embedGlm(texts, glmKey);
  return vecs.map(normalize);
}

export async function embedOne(
  text: string,
  provider: EmbeddingProvider,
  glmKey: string,
  modelDir?: string,
): Promise<number[]> {
  const vecs = await embed([text], provider, glmKey, modelDir);
  return vecs[0];
}

/**
 * Stub：确定性 hash-based embedding（无 API key/provider，仅用于测试向量库机制）。
 * 移植自 skill embeddings.py::StubEmbedding._hash_to_vector。
 */
export function stubEmbed(text: string, dim: number = EMBED_DIM): number[] {
  const seed = createHash("sha256").update(text, "utf8").digest();
  const vec: number[] = [];
  const nRounds = Math.ceil(dim / 8);
  for (let i = 0; i < nRounds; i++) {
    const ctr = Buffer.alloc(4);
    ctr.writeUInt32LE(i, 0);
    const block = createHash("sha256").update(Buffer.concat([seed, ctr])).digest();
    for (let j = 0; j < 32; j += 4) {
      if (vec.length >= dim) break;
      const u = block.readUInt32LE(j);
      vec.push((u / 0xffffffff) * 2.0 - 1.0);
    }
  }
  return normalize(vec);
}
