import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bot,
  User,
  Send,
  ChevronDown,
  ChevronRight,
  Settings2,
  Loader2,
  Wrench,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useChatStore } from "../../stores/chatStore";
import { useEditorStore } from "../../stores/editorStore";
import { useUIStore } from "../../stores/uiStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useChatStream } from "../../hooks/useChatStream";
import { chatApi } from "../../api/chat";
import type { ChatMessage } from "@fictia/shared";
import { settingsApi } from "../../api/settings";

export function ChatPanel() {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const toolCalls = useChatStore((s) => s.toolCalls);
  const selectedProviderId = useChatStore((s) => s.selectedProviderId);
  const selectedModelId = useChatStore((s) => s.selectedModelId);
  const setModel = useChatStore((s) => s.setModel);
  const loadHistory = useChatStore((s) => s.loadHistory);
  const clearMessages = useChatStore((s) => s.clearMessages);

  const providers = useSettingsStore((s) => s.providers);
  const persona = useSettingsStore((s) => s.chatPersona);
  const setPersona = useSettingsStore((s) => s.setChatPersona);

  const [input, setInput] = useState("");
  const [showPersona, setShowPersona] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const explorerWidth = useUIStore((s) => s.explorerWidth);
  const setExplorerWidth = useUIStore((s) => s.setExplorerWidth);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startWidth: explorerWidth };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = ev.clientX - dragRef.current.startX;
        setExplorerWidth(dragRef.current.startWidth + delta);
      };

      const handleMouseUp = () => {
        dragRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [explorerWidth, setExplorerWidth],
  );
  const { streamChat } = useChatStream();

  // Get current novelId from active file
  const activeFileId = useEditorStore((s) => s.activeFileId);
  const openFiles = useEditorStore((s) => s.openFiles);
  const activeNovelId = openFiles.find((f) => f.id === activeFileId)?.novelId;

  // Load chat history on mount and when novelId changes
  useEffect(() => {
    chatApi
      .history(activeNovelId)
      .then(loadHistory)
      .catch(() => {});
  }, [activeNovelId, loadHistory]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolCalls]);

  const handleSend = useCallback(() => {
    const currentInput = inputRef.current?.value ?? input;
    const text = currentInput.trim();
    if (!text) return;
    if (useChatStore.getState().isStreaming) return;
    setInput("");

    // Handle /clear command
    if (text === "/clear") {
      chatApi.clearHistory(activeNovelId).catch(() => {});
      clearMessages();
      return;
    }

    streamChat(text, activeNovelId);
  }, [streamChat, activeNovelId, input, clearMessages]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleSavePersona = useCallback(async () => {
    try {
      await settingsApi.update({ chatPersona: persona });
      setShowPersona(false);
    } catch {
      // ignore
    }
  }, [persona]);

  // usable providers for the chat picker (enabled + has enabled models)
  const usable = providers.filter((p) => p.enabled && p.models.some((m) => m.enabled));

  const currentProvider = usable.find((p) => p.id === selectedProviderId);
  const currentModel = currentProvider?.models.find((m) => m.id === selectedModelId && m.enabled);
  const currentModelLabel = currentModel
    ? `${currentProvider!.name} / ${currentModel.name}`
    : selectedModelId
      ? `${selectedProviderId}/${selectedModelId}`
      : "未选择模型";

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-subtle">
        <div className="flex items-center justify-between mb-2">
          <p className="font-caption text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
            AI 助手
          </p>
          <div className="flex items-center gap-1">
            {/* Persona settings */}
            <button
              onClick={() => setShowPersona(!showPersona)}
              className="p-1 rounded hover:bg-surface-muted/50 text-fg-muted hover:text-fg-primary transition-colors"
              title="人格设置"
            >
              <Settings2 size={13} />
            </button>
          </div>
        </div>

        {/* Model selector */}
        <div className="relative">
          <button
            onClick={() => setShowModelPicker(!showModelPicker)}
            className="w-full flex items-center justify-between rounded-md border border-subtle bg-surface-card px-2.5 py-1.5 text-xs text-fg-secondary hover:border-accent/40 transition-colors"
          >
            <span className="truncate">{currentModelLabel}</span>
            <ChevronDown size={12} className="shrink-0 ml-1" />
          </button>

          {showModelPicker && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 rounded-md border border-subtle bg-surface-card shadow-lg max-h-48 overflow-y-auto">
              {usable.length === 0 && (
                <p className="px-2.5 py-2 font-caption text-[11px] text-fg-muted">
                  暂无可用模型，请到设置中配置
                </p>
              )}
              {usable.map((provider) => (
                <div key={provider.id}>
                  <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-fg-muted bg-surface-muted/30">
                    {provider.name}
                  </div>
                  {provider.models
                    .filter((m) => m.enabled)
                    .map((m) => (
                      <button
                        key={`${provider.id}-${m.id}`}
                        onClick={() => {
                          setModel(provider.id, m.id);
                          setShowModelPicker(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 text-xs transition-colors ${
                          selectedProviderId === provider.id && selectedModelId === m.id
                            ? "bg-accent-bg text-accent"
                            : "text-fg-secondary hover:bg-surface-muted/50"
                        }`}
                      >
                        {m.name}
                      </button>
                    ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Persona editor (collapsible) */}
      {showPersona && (
        <div className="px-3 py-2 border-b border-subtle bg-surface-muted/20">
          <p className="font-caption text-[10px] text-fg-muted mb-1.5">AI 人格设定</p>
          <textarea
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            rows={4}
            placeholder="留空将使用默认人格"
            className="w-full rounded-md border border-subtle bg-surface-card px-2.5 py-1.5 font-body text-xs text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 resize-none"
          />
          <div className="flex justify-end gap-2 mt-1.5">
            <button
              onClick={() => setShowPersona(false)}
              className="px-2 py-1 text-[11px] rounded text-fg-muted hover:text-fg-primary transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSavePersona}
              className="px-2 py-1 text-[11px] rounded bg-accent text-white hover:bg-accent/90 transition-colors"
            >
              保存
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <Bot size={28} className="text-fg-muted/30 mb-2" />
            <p className="font-caption text-xs text-fg-muted mb-1">你好！我是你的写作助手</p>
            <p className="font-caption text-[10px] text-fg-muted/60">
              可以帮你查看和修改小说文档，<br />
              提供创作建议。输入消息开始对话。
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <ChatMessageItem key={msg.id ?? i} message={msg} isLast={i === messages.length - 1} />
        ))}

        {/* Tool calls display */}
        {toolCalls.length > 0 && (
          <ToolCallsDisplay toolCalls={toolCalls} />
        )}

        {isStreaming && messages.length > 0 && messages[messages.length - 1].role === "assistant" && messages[messages.length - 1].content === "" && (
          <div className="flex items-center gap-2 text-fg-muted">
            <Loader2 size={14} className="animate-spin" />
            <span className="font-caption text-xs">思考中...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-2 border-t border-subtle">
        <div className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
            rows={2}
            className="w-full rounded-md border border-subtle bg-surface-card pl-3 pr-10 py-2 font-body text-xs text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 resize-none"
            disabled={isStreaming}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="absolute right-2 bottom-2 p-1.5 rounded-md bg-accent text-white hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isStreaming ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
          </button>
        </div>
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent/30 transition-colors z-10"
      />
    </div>
  );
}

function ChatMessageItem({ message, isLast }: { message: ChatMessage; isLast: boolean }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
          isUser ? "bg-accent/10" : "bg-surface-muted"
        }`}
      >
        {isUser ? (
          <User size={12} className="text-accent" />
        ) : (
          <Bot size={12} className="text-fg-muted" />
        )}
      </div>
      <div
        className={`flex-1 rounded-lg px-2.5 py-2 text-xs leading-relaxed ${
          isUser
            ? "bg-accent/10 text-fg-primary"
            : "bg-surface-muted/30 text-fg-primary"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose-chat">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content || (isLast ? "..." : "")}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCallsDisplay({
  toolCalls,
}: {
  toolCalls: Array<{ tool: string; input: string; result: string }>;
}) {
  const [expanded, setExpanded] = useState(false);

  const toolLabels: Record<string, string> = {
    read_file: "读取文件",
    write_file: "写入文件",
    list_files: "列出文件",
    read_chapter: "读取章节",
    list_chapters: "列出章节",
    save_memory: "保存记忆",
  };

  return (
    <div className="ml-8">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] text-fg-muted hover:text-fg-secondary transition-colors"
      >
        <Wrench size={10} />
        <span>
          {toolCalls.length} 次工具调用
        </span>
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </button>

      {expanded && (
        <div className="mt-1 space-y-1">
          {toolCalls.map((tc, i) => (
            <div
              key={i}
              className="rounded border border-subtle bg-surface-muted/20 px-2 py-1.5"
            >
              <p className="font-caption text-[10px] font-semibold text-accent">
                {toolLabels[tc.tool] ?? tc.tool}
              </p>
              <p className="font-caption text-[10px] text-fg-muted truncate">
                {tc.input.slice(0, 80)}
                {tc.input.length > 80 ? "..." : ""}
              </p>
              {tc.result && (
                <p className="font-caption text-[10px] text-fg-secondary mt-0.5 line-clamp-2">
                  {tc.result}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
