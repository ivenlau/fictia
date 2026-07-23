/**
 * Embedding：按 provider 分流。
 *   glm     -> 智谱 embedding-2 API（1024 维），需 API key。
 *   bge-m3  -> 本地 transformers.js（1024 维），无需 key。
 *
 * 两种 provider 都是 1024 维（EMBED_DIM 不变），但向量空间不同，
 * 切换 provider 后旧索引不可复用（由向量库的 index_provider 记录并校验）。
 *
 * stub（测试用，无 key/provider 时的确定性 hash embedding）。
 */

import { createHash } from "crypto";
import type { EmbeddingProvider } from "../../../../packages/shared/src/types.js";
import { localEmbed } from "./local-embedder.js";

export const EMBED_DIM = 1024;
export type { EmbeddingProvider };
/** 别名，便于后端按习惯引用。 */
export type EmbedProvider = EmbeddingProvider;

const GLM_API_URL = "https://open.bigmodel.cn/api/paas/v4/embeddings";
const GLM_MODEL = "embedding-2";

export class EmbeddingError extends Error {}

/** 智谱 embedding-2 批量嵌入。 */
async function embedGlm(texts: string[], apiKey: string): Promise<number[][]> {
  if (!apiKey) throw new EmbeddingError("未配置 GLM API Key（请在「设置 → 模型提供商」中配置 GLM）");

  const resp = await fetch(GLM_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: GLM_MODEL, input: texts }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new EmbeddingError(`智谱 embedding API 失败 ${resp.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await resp.json()) as { data: { embedding: number[] }[] };
  return data.data.map((item) => item.embedding);
}

/**
 * 批量嵌入：glm 走智谱 API，bge-m3 走本地 transformers.js。
 */
export async function embed(
  texts: string[],
  provider: EmbeddingProvider,
  glmKey: string,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  return provider === "bge-m3" ? localEmbed(texts) : embedGlm(texts, glmKey);
}

export async function embedOne(
  text: string,
  provider: EmbeddingProvider,
  glmKey: string,
): Promise<number[]> {
  const vecs = await embed([text], provider, glmKey);
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
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1.0;
  return vec.map((x) => x / norm);
}
