import { useEffect, useRef, useState } from "react";
import { X, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { agentsApi } from "@/api/agents";

interface AgentStreamModalProps {
  outputId: string;
  agentLabel: string;
  onClose: () => void;
}

export function AgentStreamModal({ outputId, agentLabel, onClose }: AgentStreamModalProps) {
  const [status, setStatus] = useState<string>("running");
  const [content, setContent] = useState<string>("");
  const esRef = useRef<EventSource | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const url = agentsApi.getStreamUrl(outputId);
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener("status", (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.status) setStatus(data.status);
        if (data.content) setContent(data.content);
      } catch {}
    });

    es.addEventListener("done", (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.status) setStatus(data.status);
      } catch {}
      es.close();
    });

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, [outputId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content]);

  const statusBadge = status === "running" ? (
    <span className="flex items-center gap-1 font-caption text-[11px] text-accent">
      <Loader2 size={12} className="animate-spin" />
      运行中
    </span>
  ) : status === "completed" ? (
    <span className="flex items-center gap-1 font-caption text-[11px] text-success">
      <CheckCircle2 size={12} />
      已完成
    </span>
  ) : status === "failed" ? (
    <span className="flex items-center gap-1 font-caption text-[11px] text-error">
      <XCircle size={12} />
      失败
    </span>
  ) : (
    <span className="font-caption text-[11px] text-fg-muted">{status}</span>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col h-[70vh] w-[900px] max-w-[95vw] rounded-xl border border-subtle bg-surface-primary shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-subtle px-5 py-3">
          <div className="flex items-center gap-3">
            <h3 className="font-heading text-base font-bold text-fg-primary">
              {agentLabel}
            </h3>
            {statusBadge}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-fg-muted hover:text-fg-primary hover:bg-surface-muted transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div ref={contentRef} className="flex-1 overflow-auto p-5">
          {status === "running" && !content && (
            <div className="flex h-full items-center justify-center">
              <div className="flex items-center gap-2 text-fg-muted">
                <Loader2 size={16} className="animate-spin" />
                <span className="font-caption text-sm">Agent 运行中，请稍候...</span>
              </div>
            </div>
          )}
          {content && (
            <pre className="font-body text-sm text-fg-secondary whitespace-pre-wrap leading-relaxed">
              {content}
            </pre>
          )}
          {status === "failed" && !content && (
            <div className="flex h-full items-center justify-center">
              <p className="font-caption text-sm text-error">Agent 执行失败</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
