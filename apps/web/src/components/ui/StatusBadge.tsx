type Status = "completed" | "running" | "failed" | "idle";

interface StatusBadgeProps {
  status: Status;
  label: string;
}

const dotClasses: Record<Status, string> = {
  completed: "bg-success shadow-[0_0_8px_rgb(var(--c-success)/0.55)]",
  running: "bg-warning animate-pulse-soft shadow-[0_0_8px_rgb(var(--c-accent)/0.55)]",
  failed: "bg-error shadow-[0_0_8px_rgb(var(--c-rose)/0.5)]",
  idle: "bg-fg-muted",
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-caption text-fg-secondary">
      <span className={`h-1.5 w-1.5 rounded-full ${dotClasses[status]}`} />
      {label}
    </span>
  );
}
