/**
 * 本地 embedding：transformers.js + bge-m3（dense，1024 维）。
 * 默认 fp32（无损最高质量），跑在高性能机器上。
 * 单例缓存 pipeline，避免重复加载模型。
 *
 * 环境变量：
 *   EMBEDDING_DTYPE - 模型精度，默认 fp32（可选 fp16/q8/q4）
 *   HF_ENDPOINT     - HuggingFace 镜像，如 https://hf-mirror.com
 */
import { pipeline, env } from "@huggingface/transformers";

const MODEL_ID = "Xenova/bge-m3";

// 关闭本地模型目录扫描，统一走远程拉取（模型随用随下，缓存于系统缓存目录）
env.allowLocalModels = false;

// 镜像支持（国内网络）：若设了 HF_ENDPOINT 则走镜像。
if (process.env.HF_ENDPOINT) {
  const host = process.env.HF_ENDPOINT.endsWith("/")
    ? process.env.HF_ENDPOINT
    : process.env.HF_ENDPOINT + "/";
  // transformers.js v3 用 env.remoteHost 指定远端基址；用 any 规避版本字段差异。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (env as any).remoteHost = host;
}

let extractorPromise: Promise<unknown> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getExtractor(): Promise<any> {
  if (!extractorPromise) {
    const dtype =
      (process.env.EMBEDDING_DTYPE as string | undefined) ?? "fp32";
    extractorPromise = pipeline("feature-extraction", MODEL_ID, {
      dtype: dtype as "fp32" | "fp16" | "q8" | "q4",
    });
  }
  return extractorPromise;
}

/**
 * 本地 bge-m3 批量嵌入，返回 L2 归一化后的 1024 维向量。
 */
export async function localEmbed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const extractor = await getExtractor();
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  return (output as { tolist: () => number[][] }).tolist();
}
