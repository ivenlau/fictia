import { useCallback } from "react";
import { useChatStore } from "../stores/chatStore";
import type { ChatMessage, ChatRequest } from "@fictia/shared";

export function useChatStream() {
  const addMessage = useChatStore((s) => s.addMessage);
  const appendToLast = useChatStore((s) => s.appendToLast);
  const addToolCall = useChatStore((s) => s.addToolCall);
  const setStreaming = useChatStore((s) => s.setStreaming);

  const streamChat = useCallback(
    async (userMessage: string, novelId?: string) => {
      const selectedProviderId = useChatStore.getState().selectedProviderId;
      const selectedModelId = useChatStore.getState().selectedModelId;

      // Add user message
      const userMsg: ChatMessage = {
        id: `temp-user-${Date.now()}`,
        novelId: novelId ?? null,
        role: "user",
        content: userMessage,
        toolCalls: null,
        modelUsed: null,
        providerUsed: null,
        createdAt: new Date().toISOString(),
      };
      addMessage(userMsg);

      // Add placeholder assistant message
      const assistantMsg: ChatMessage = {
        id: `temp-assistant-${Date.now()}`,
        novelId: novelId ?? null,
        role: "assistant",
        content: "",
        toolCalls: null,
        modelUsed: selectedModelId,
        providerUsed: selectedProviderId,
        createdAt: new Date().toISOString(),
      };
      addMessage(assistantMsg);
      setStreaming(true);

      // Build history from existing messages (excluding the two we just added)
      const history = useChatStore.getState().messages
        .slice(0, -2)
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      const request: ChatRequest = {
        message: userMessage,
        novelId,
        providerId: selectedProviderId,
        modelId: selectedModelId,
        history,
      };

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          appendToLast(`\n\n错误: ${err.error ?? res.statusText}`);
          setStreaming(false);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setStreaming(false);
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              switch (data.type) {
                case "text_delta":
                  appendToLast(data.delta);
                  break;
                case "tool_call":
                  addToolCall({ tool: data.tool, input: data.input, result: "" });
                  break;
                case "tool_result":
                  useChatStore.setState((s) => {
                    const tcs = [...s.toolCalls];
                    const last = tcs[tcs.length - 1];
                    if (last && last.tool === data.tool) {
                      tcs[tcs.length - 1] = { ...last, result: data.result };
                    }
                    return { toolCalls: tcs };
                  });
                  break;
                case "error":
                  appendToLast(`\n\n错误: ${data.error}`);
                  break;
                case "done":
                  break;
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      } catch (err: any) {
        appendToLast(`\n\n连接错误: ${err.message}`);
      } finally {
        setStreaming(false);
      }
    },
    [addMessage, appendToLast, addToolCall, setStreaming],
  );

  return { streamChat };
}
