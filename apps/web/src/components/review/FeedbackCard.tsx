import { Tag } from "../ui/Tag";
import { Button } from "../ui/Button";

export interface ReviewFeedback {
  id: string;
  reviewer: string;
  line: number;
  severity: "info" | "warning" | "error";
  message: string;
}

interface FeedbackCardProps {
  feedback: ReviewFeedback;
  onAdopt: (id: string) => void;
  onIgnore: (id: string) => void;
}

const severityVariant: Record<ReviewFeedback["severity"], "info" | "warning" | "default"> = {
  info: "info",
  warning: "warning",
  error: "default",
};

export function FeedbackCard({ feedback, onAdopt, onIgnore }: FeedbackCardProps) {
  return (
    <div className="bg-surface-card border border-subtle rounded-lg p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-caption font-medium text-fg-primary">
            {feedback.reviewer}
          </span>
          <span className="text-[11px] font-caption text-fg-muted">
            Line {feedback.line}
          </span>
        </div>
        <Tag variant={severityVariant[feedback.severity]}>
          {feedback.severity}
        </Tag>
      </div>

      <p className="text-[13px] font-body text-fg-secondary leading-relaxed">
        {feedback.message}
      </p>

      <div className="flex items-center gap-2 self-end">
        <Button size="small" variant="ghost" onClick={() => onIgnore(feedback.id)}>
          Ignore
        </Button>
        <Button size="small" variant="primary" onClick={() => onAdopt(feedback.id)}>
          Adopt
        </Button>
      </div>
    </div>
  );
}
