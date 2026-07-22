/**
 * 写作循环 / 一致性校验的 SSE 客户端。
 * 这些端点是 POST + text/event-stream（EventSource 只支持 GET，故用 fetch + ReadableStream 消费）。
 */

const BASE_URL = "/api";

export interface WritingLoopEvent {
  type: "start" | "progress" | "result" | "milestone" | "done" | "error";
  [key: string]: unknown;
}

export async function consumeSse(
  res: Response,
  onEvent: (e: WritingLoopEvent) => void,
): Promise<void> {
  if (!res.body) throw new Error("响应无 body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const line = part
        .split("\n")
        .find((l) => l.startsWith("data:"));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()));
      } catch {
        // 忽略非 JSON 帧
      }
    }
  }
}

export async function runWritingLoop(
  novelId: string,
  body: { chapterNumber?: number; maxRounds?: number },
  onEvent: (e: WritingLoopEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/novels/${novelId}/writing-loop`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  await consumeSse(res, onEvent);
}

export async function runConsistencyCheck(
  novelId: string,
  onEvent: (e: WritingLoopEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/novels/${novelId}/consistency-check`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({}),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  await consumeSse(res, onEvent);
}
