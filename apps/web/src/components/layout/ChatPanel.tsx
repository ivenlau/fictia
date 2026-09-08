import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bot,
  User,
  Send,
  ChevronDown,
  ChevronRight,
  Settings,
  Loader2,
  Trash2,
  Wrench,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useChatStore } from "../../stores/chatStore";
import { SnippetPicker } from "../material/SnippetPicker";
import { useEditorStore } from "../../stores/editorStore";
import { useUIStore } from "../../stores/uiStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useChatStream } from "../../hooks/useChatStream";
import { chatApi } from "../../api/chat";
import { novelsApi } from "../../api/novels";
import { MemoryButton } from "../chat/MemoryButton";
import { InkCaret, ThinkingDots } from "../ui/InkCaret";
import { MEMORY_PATH, type ChatMessage } from "@fictia/shared";

export function ChatPanel() {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const toolCalls = useChatStore((s) => s.toolCalls);
  const loadHistory = useChatStore((s) => s.loadHistory);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const addMessage = useChatStore((s) => s.addMessage);

  const providers = useSettingsStore((s) => s.providers);
  const chatModel = useSettingsStore((s) => s.chatModel);
  const openSettings = useUIStore((s) => s.openSettings);

  const [input, setInput] = useState("");
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

    // Handle /memory command: 显示 AI 记忆文件内容
    if (text === "/memory") {
      if (!activeNovelId) return;
      novelsApi
        .getFiles(activeNovelId)
        .then((files) => {
          const mem = files.find((f) => f.path === MEMORY_PATH);
          addMessage({
            id: `temp-memory-${Date.now()}`,
            novelId: activeNovelId,
            role: "assistant",
            content: `📋 **AI 记忆**\n\n${mem?.content ?? "(暂无记忆)"}`,
            toolCalls: null,
            modelUsed: null,
            providerUsed: null,
            createdAt: new Date().toISOString(),
          });
        })
        .catch(() => {});
      return;
    }

    streamChat(text, activeNovelId);
  }, [streamChat, activeNovelId, input, clearMessages, addMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // current chat model label (read-only; managed in Settings, 对话助手 tab)
  const currentProvider = providers.find((p) => p.id === chatModel.providerId);
  const currentModel = currentProvider?.models.find((m) => m.id === chatModel.modelId);
  const currentModelLabel = currentModel
    ? `${currentProvider!.name} / ${currentModel.name}`
    : chatModel.modelId
      ? `${chatModel.providerId}/${chatModel.modelId}（已停用）`
      : "未选择模型";

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-subtle bg-surface-secondary/40">
        <div className="flex items-center justify-between mb-2">
          <p className="font-display text-[12px] font-semibold tracking-wide text-fg-primary">
            AI 助手
          </p>
          <span className="font-caption text-[10px] text-fg-muted">/clear · /memory</span>
        </div>
        <button
          onClick={() => openSettings("assistant")}
          className="w-full flex items-center justify-between rounded-md border border-subtle bg-surface-card px-2.5 py-1.5 text-[11px] font-caption text-fg-secondary transition-colors hover:border-accent/40 hover:text-fg-primary"
          title="在设置中修改对话模型与人格"
        >
          <span className="flex items-center gap-1.5 truncate">
            <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_6px_rgba(87,217,163,0.55)]" />
            {currentModelLabel}
          </span>
          <Settings size={12} className="shrink-0 ml-1 text-fg-muted" />
        </button>
      </div>

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
          <div key={msg.id ?? i} className="animate-fade-in-up">
            <ChatMessageItem message={msg} isLast={i === messages.length - 1} />
          </div>
        ))}

        {/* Tool calls display */}
        {toolCalls.length > 0 && (
          <ToolCallsDisplay toolCalls={toolCalls} />
        )}

        <PendingConfirmation />

        {isStreaming && messages.length > 0 && messages[messages.length - 1].role === "assistant" && messages[messages.length - 1].content === "" && (
          <ThinkingDots label="思考中..." />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-2 border-t border-subtle">
        <div className="flex items-center gap-1 mb-1">
          <SnippetPicker
            novelId={activeNovelId}
            disabled={isStreaming}
            onInsert={(c) => setInput((prev) => (prev ? `${prev}\n\n${c}` : c))}
          />
          <MemoryButton novelId={activeNovelId} disabled={isStreaming} />
          <button
            type="button"
            onClick={() => {
              if (!window.confirm("清空对话历史？")) return;
              chatApi.clearHistory(activeNovelId).catch(() => {});
              clearMessages();
            }}
            disabled={isStreaming || messages.length === 0}
            title="清空对话 (/clear)"
            className="p-1.5 rounded-md text-fg-muted hover:text-fg-primary hover:bg-surface-secondary disabled:opacity-30 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
        <div className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
            rows={2}
            className="w-full rounded-lg border border-subtle bg-surface-inset pl-3 pr-10 py-2 font-body text-xs text-fg-primary placeholder:text-fg-muted/70 transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30 resize-none"
            disabled={isStreaming}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="btn-press absolute right-2 bottom-2 rounded-md bg-accent p-1.5 text-accent-ink transition-all hover:bg-accent-light disabled:opacity-40 disabled:cursor-not-allowed"
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
  const isStreamingLast = useChatStore((s) => s.isStreaming) && isLast && !isUser && !!message.content;

  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-accent/15 text-accent" : "bg-surface-elevated text-cyan"
        }`}
      >
        {isUser ? <User size={12} /> : <Bot size={12} />}
      </div>
      <div
        className={`flex-1 rounded-xl border px-3 py-2 text-xs leading-relaxed ${
          isUser
            ? "border-accent/25 bg-accent/10 text-fg-primary"
            : "border-subtle bg-surface-inset text-fg-primary"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose-chat">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content || (isLast ? "..." : "")}
            </ReactMarkdown>
            {isStreamingLast && <InkCaret />}
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

function PendingConfirmation() {
  const pending = useChatStore((s) => s.pendingConfirmation);
  const setPending = useChatStore((s) => s.setPendingConfirmation);
  if (!pending) return null;

  const confirm = async (approved: boolean) => {
    try {
      await fetch("/api/chat/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId: pending.callId, approved }),
      });
    } catch {
      // 忽略网络错误，后端超时会自行拒绝
    }
    setPending(null);
  };

  return (
    <div className="ml-8 rounded border border-warning/40 bg-warning/8 px-2 py-1.5">
      <p className="font-caption text-[10px] font-semibold text-warning flex items-center gap-1">
        <Wrench size={10} /> 需确认工具调用: {pending.tool}
      </p>
      <p className="font-caption text-[10px] text-fg-muted truncate mt-0.5">
        {pending.input.slice(0, 120)}
        {pending.input.length > 120 ? "..." : ""}
      </p>
      <div className="flex gap-1.5 mt-1">
        <button
          onClick={() => confirm(true)}
          className="rounded bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-ink transition-colors hover:bg-accent-light"
        >
          批准
        </button>
        <button
          onClick={() => confirm(false)}
          className="px-2 py-0.5 rounded border border-subtle text-fg-secondary text-[10px] hover:bg-surface-muted transition-colors"
        >
          拒绝
        </button>
      </div>
      <p className="font-caption text-[9px] text-fg-muted/60 mt-0.5">60 秒未确认将自动拒绝</p>
    </div>
  );
}
