/**
 * 本地 embedding：transformers.js + bge-m3（dense，1024 维）。
 *
 * 模式：
 *   - 不传 modelDir：远程拉取 Xenova/bge-m3（env.allowLocalModels=false，随用随下，
 *     缓存于系统缓存目录）。可经 HF_ENDPOINT 走镜像。
 *   - 传 modelDir：从用户指定的本地目录加载（env.allowLocalModels=true，pipeline
 *     直接读该目录）。用于离线 / 自定义模型。
 *
 * 单例缓存 pipeline；modelDir 变化时重置缓存重新加载。
 *
 * 环境变量：
 *   EMBEDDING_DTYPE - 模型精度，默认 fp32（可选 fp16/q8/q4）
 *   HF_ENDPOINT     - HuggingFace 镜像（仅远程模式生效），如 https://hf-mirror.com
 */
import { pipeline, env } from "@huggingface/transformers";

const MODEL_ID = "Xenova/bge-m3";

// 镜像支持（国内网络，仅远程模式）：若设了 HF_ENDPOINT 则走镜像。
if (process.env.HF_ENDPOINT) {
  const host = process.env.HF_ENDPOINT.endsWith("/")
    ? process.env.HF_ENDPOINT
    : process.env.HF_ENDPOINT + "/";
  // transformers.js v3 用 env.remoteHost 指定远端基址；用 any 规避版本字段差异。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (env as any).remoteHost = host;
}

let extractorPromise: Promise<unknown> | null = null;
let currentModelDir: string | undefined;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getExtractor(modelDir?: string): Promise<any> {
  // modelDir 变化时丢弃旧 pipeline，重新加载
  if (currentModelDir !== modelDir) {
    extractorPromise = null;
    currentModelDir = modelDir;
  }
  if (!extractorPromise) {
    const dtype = (process.env.EMBEDDING_DTYPE as string | undefined) ?? "fp32";
    if (modelDir && modelDir.trim()) {
      env.allowLocalModels = true;
      extractorPromise = pipeline("feature-extraction", modelDir.trim(), {
        dtype: dtype as "fp32" | "fp16" | "q8" | "q4",
      });
    } else {
      env.allowLocalModels = false;
      extractorPromise = pipeline("feature-extraction", MODEL_ID, {
        dtype: dtype as "fp32" | "fp16" | "q8" | "q4",
      });
    }
  }
  return extractorPromise;
}

/**
 * 本地 bge-m3 批量嵌入，返回 L2 归一化后的 1024 维向量。
 * modelDir 指定则从该目录加载，否则远程拉取 Xenova/bge-m3。
 */
export async function localEmbed(texts: string[], modelDir?: string): Promise<number[][]> {
  if (texts.length === 0) return [];
  const extractor = await getExtractor(modelDir);
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  return (output as { tolist: () => number[][] }).tolist();
}
