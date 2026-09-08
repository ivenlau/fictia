import { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  AlertCircle,
  Info,
  Filter,
} from "lucide-react";
import type { ReviewFeedback, FeedbackSeverity } from "@fictia/shared";

interface ProblemsPanelProps {
  feedback: ReviewFeedback[];
  onAdopt: (id: string) => void;
  onIgnore: (id: string) => void;
}

const reviewerLabels: Record<string, string> = {
  editor: "编辑",
  "consistency-checker": "一致性检查",
};

const severityIcons: Record<FeedbackSeverity, React.ElementType> = {
  critical: AlertCircle,
  warning: AlertTriangle,
  suggestion: Info,
};

const severityColors: Record<FeedbackSeverity, string> = {
  critical: "text-error",
  warning: "text-warning",
  suggestion: "text-info",
};

const severityBg: Record<FeedbackSeverity, string> = {
  critical: "bg-error/10",
  warning: "bg-warning/10",
  suggestion: "bg-info/10",
};

const statusColors: Record<string, string> = {
  pending: "bg-surface-muted text-fg-muted",
  adopted: "bg-accent-bg text-accent",
  ignored: "bg-fg-muted/10 text-fg-muted",
  resolved: "bg-info/15 text-info",
};

const statusLabels: Record<string, string> = {
  pending: "待处理",
  adopted: "已采纳",
  ignored: "已忽略",
  resolved: "已解决",
};

type FilterType = "all" | string;

export function ProblemsPanel({ feedback, onAdopt, onIgnore }: ProblemsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [absorbingId, setAbsorbingId] = useState<string | null>(null);

  const filtered = useMemo(
    () => (filter === "all" ? feedback : feedback.filter((f) => f.reviewerType === filter)),
    [feedback, filter],
  );

  const handleAdopt = (id: string) => {
    setAbsorbingId(id);
    window.setTimeout(() => {
      onAdopt(id);
      setAbsorbingId(null);
    }, 280);
  };

  const filterOptions: { value: FilterType; label: string }[] = [
    { value: "all", label: "全部" },
    { value: "editor", label: "编辑" },
    { value: "consistency-checker", label: "一致性检查" },
  ];

  return (
    <div className="rounded-lg border border-subtle bg-surface-card">
      <button
        onClick={() => setIsExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={15} className="text-warning" />
          <h3 className="font-heading text-sm font-semibold text-fg-primary">
            问题面板
          </h3>
          <span className="inline-block rounded bg-surface-muted px-1.5 py-0.5 font-caption text-[10px] text-fg-muted">
            {feedback.length}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp size={15} className="text-fg-muted" />
        ) : (
          <ChevronDown size={15} className="text-fg-muted" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-subtle">
          <div className="flex items-center gap-1 px-4 py-2 border-b border-subtle/50 bg-surface-muted/50">
            <Filter size={13} className="text-fg-muted mr-1" />
            {filterOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={`rounded px-2 py-0.5 font-caption text-xs transition-colors ${
                  filter === opt.value
                    ? "bg-accent text-accent-ink"
                    : "text-fg-muted hover:bg-surface-secondary"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="max-h-64 overflow-auto">
            {filtered.length === 0 ? (
              <div className="p-4 text-center">
                <p className="font-caption text-xs text-fg-muted">暂无反馈</p>
              </div>
            ) : (
              <ul className="divide-y divide-subtle/50">
                {filtered.map((item, idx) => {
                  const SevIcon = severityIcons[item.severity];
                  const isAbsorbing = absorbingId === item.id;
                  return (
                    <li
                      key={item.id}
                      className={`flex items-start gap-3 px-4 py-3 origin-top ${
                        isAbsorbing ? "animate-pen-absorb" : "stagger-child"
                      }`}
                      style={isAbsorbing ? undefined : { ["--stagger-i" as string]: Math.min(idx, 8) }}
                    >
                      <div
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded ${severityBg[item.severity]}`}
                      >
                        <SevIcon
                          size={13}
                          className={severityColors[item.severity]}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-caption text-[10px] text-fg-muted">
                            {reviewerLabels[item.reviewerType]}
                          </span>
                          {item.lineNumber > 0 && (
                            <span className="font-caption text-[10px] text-fg-muted">
                              第{item.lineNumber}行
                            </span>
                          )}
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 font-caption text-[10px] ${statusColors[item.status]}`}
                          >
                            {statusLabels[item.status]}
                          </span>
                        </div>
                        <p className="font-body text-sm text-fg-primary leading-relaxed">
                          {item.message}
                        </p>
                        {item.status === "pending" && (
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              onClick={() => handleAdopt(item.id)}
                              className="btn-press rounded bg-accent-bg px-2 py-0.5 font-caption text-xs text-accent transition-colors hover:bg-accent-bg/80"
                            >
                              采纳
                            </button>
                            <button
                              onClick={() => onIgnore(item.id)}
                              className="rounded bg-surface-muted px-2 py-0.5 font-caption text-xs text-fg-muted transition-colors hover:bg-surface-secondary"
                            >
                              忽略
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
