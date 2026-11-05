import { useCallback, useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  PenLine,
  ShieldCheck,
  Loader2,
  CheckCircle2,
} from "lucide-react";

interface ReviewActionsProps {
  chapterId: string;
  novelId: string;
  onTrigger: (type: string) => Promise<string | undefined>;
}

interface ReviewOption {
  type: string;
  label: string;
  icon: React.ElementType;
  description: string;
}

const reviewOptions: ReviewOption[] = [
  {
    type: "editor",
    label: "编辑审核",
    icon: PenLine,
    description: "编辑视角深度审稿",
  },
  {
    type: "consistency",
    label: "一致性检查",
    icon: ShieldCheck,
    description: "检查章节与整体设定的一致性",
  },
];

export function ReviewActions({ chapterId, novelId, onTrigger }: ReviewActionsProps) {
  const queryClient = useQueryClient();
  const [statuses, setStatuses] = useState<
    Record<string, "idle" | "running" | "done">
  >({
    editor: "idle",
    consistency: "idle",
  });
  const pollRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      Object.values(pollRefs.current).forEach(clearInterval);
    };
  }, []);

  const handleTrigger = useCallback(
    async (type: string) => {
      setStatuses((prev) => ({ ...prev, [type]: "running" }));
      const outputId = await onTrigger(type);
      if (!outputId) {
        setStatuses((prev) => ({ ...prev, [type]: "idle" }));
        return;
      }

      // Poll for completion
      const poll = setInterval(async () => {
        try {
          const res = await fetch(`/api/agents/${outputId}/status`);
          const data = await res.json();
          if (data.status !== "running") {
            clearInterval(poll);
            delete pollRefs.current[outputId];
            setStatuses((prev) => ({ ...prev, [type]: "done" }));
            queryClient.invalidateQueries({ queryKey: ["feedback", chapterId] });
            queryClient.invalidateQueries({ queryKey: ["agent-outputs", novelId] });
          }
        } catch {}
      }, 2000);
      pollRefs.current[outputId] = poll;
    },
    [onTrigger, chapterId, novelId, queryClient],
  );

  return (
    <div className="flex items-center gap-2">
      {reviewOptions.map((opt) => {
        const Icon = opt.icon;
        const status = statuses[opt.type];
        const isRunning = status === "running";
        const isDone = status === "done";

        return (
          <button
            key={opt.type}
            onClick={() => handleTrigger(opt.type)}
            disabled={isRunning}
            title={opt.description}
            className="flex items-center gap-1.5 rounded-md border border-subtle bg-surface-card px-3 py-1.5 font-body text-xs text-fg-secondary transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isRunning ? (
              <Loader2 size={14} className="animate-spin text-accent" />
            ) : isDone ? (
              <CheckCircle2 size={14} className="text-accent" />
            ) : (
              <Icon size={14} />
            )}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
