import { Check, Loader2, Circle } from "lucide-react";

type StageStatus = "done" | "active" | "pending";

interface StageVerticalProps {
  label: string;
  status: StageStatus;
  isLast?: boolean;
}

const statusConfig: Record<
  StageStatus,
  { icon: React.ElementType; color: string; bg: string }
> = {
  done: { icon: Check, color: "text-accent", bg: "bg-accent-bg" },
  active: { icon: Loader2, color: "text-accent", bg: "bg-accent-bg" },
  pending: { icon: Circle, color: "text-fg-muted", bg: "bg-surface-muted" },
};

export function StageVertical({ label, status, isLast = false }: StageVerticalProps) {
  const { icon: Icon, color, bg } = statusConfig[status];

  return (
    <div className="flex flex-col items-center">
      <div
        className={`w-8 h-8 flex items-center justify-center rounded-full ${bg} ${color}`}
      >
        <Icon size={16} className={status === "active" ? "animate-spin" : ""} />
      </div>
      <span className="mt-1 text-[12px] font-caption text-fg-secondary text-center">
        {label}
      </span>
      {!isLast && <div className="w-px h-6 bg-border-subtle my-1" />}
    </div>
  );
}
