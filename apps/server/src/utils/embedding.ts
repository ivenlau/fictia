/**
 * Embedding：智谱 embedding-2 API（1024 维）+ stub（测试用，无 API key）。
 * 对齐 skill 的 ZhipuApiEmbedding（同端点、同模型、同维度）。
 */

import { createHash } from "crypto";

export const EMBED_DIM = 1024;
const API_URL = "https://open.bigmodel.cn/api/paas/v4/embeddings";
const MODEL = "embedding-2";

export class EmbeddingError extends Error {}

/**
 * 调用智谱 embedding-2 批量嵌入。apiKey 为智谱/GLM API key。
 */
export async function embed(texts: string[], apiKey: string): Promise<number[][]> {
  if (!apiKey) throw new EmbeddingError("未配置 GLM/智谱 API key（settings.apiKeyGlm）");
  if (texts.length === 0) return [];

  const resp = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new EmbeddingError(`智谱 embedding API 失败 ${resp.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await resp.json()) as { data: { embedding: number[] }[] };
  return data.data.map((item) => item.embedding);
}

export async function embedOne(text: string, apiKey: string): Promise<number[]> {
  const vecs = await embed([text], apiKey);
  return vecs[0];
}

/**
 * Stub：确定性 hash-based embedding（无 API key，仅用于测试向量库机制）。
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
