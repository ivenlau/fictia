import { useState, useCallback, useRef } from "react";

interface UseStreamingOptions {
  onDelta?: (delta: string) => void;
  onComplete?: (fullText: string) => void;
  onError?: (error: Error) => void;
}

export function useStreaming(url: string | null, options: UseStreamingOptions = {}) {
  const [text, setText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(() => {
    if (!url) return;

    setIsStreaming(true);
    setText("");
    setError(null);

    const abortController = new AbortController();
    abortRef.current = abortController;

    const es = new EventSource(url);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.delta) {
          setText((prev) => prev + data.delta);
          options.onDelta?.(data.delta);
        }
      } catch {
        // plain text delta
        setText((prev) => prev + event.data);
        options.onDelta?.(event.data);
      }
    };

    es.addEventListener("agent_end", () => {
      setIsStreaming(false);
      es.close();
      options.onComplete?.(text);
    });

    es.addEventListener("error", () => {
      const err = new Error("Stream connection failed");
      setError(err);
      setIsStreaming(false);
      es.close();
      options.onError?.(err);
    });

    abortRef.current = { abort: () => es.close() } as unknown as AbortController;
  }, [url, options, text]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return { text, isStreaming, error, start, stop, setText };
}
