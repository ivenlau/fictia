type Status = "completed" | "running" | "failed" | "idle";

interface StatusBadgeProps {
  status: Status;
  label: string;
}

const dotClasses: Record<Status, string> = {
  completed: "bg-success",
  running: "bg-warning animate-pulse",
  failed: "bg-error",
  idle: "bg-fg-muted",
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-caption text-fg-secondary">
      <span className={`w-2 h-2 rounded-full ${dotClasses[status]}`} />
      {label}
    </span>
  );
}
