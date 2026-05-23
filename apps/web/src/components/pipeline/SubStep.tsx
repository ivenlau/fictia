import { Check, Loader2, Circle } from "lucide-react";

type StepStatus = "done" | "active" | "pending";

interface SubStepProps {
  label: string;
  status: StepStatus;
}

const statusConfig: Record<
  StepStatus,
  { icon: React.ElementType; color: string }
> = {
  done: { icon: Check, color: "text-success" },
  active: { icon: Loader2, color: "text-accent" },
  pending: { icon: Circle, color: "text-fg-muted" },
};

export function SubStep({ label, status }: SubStepProps) {
  const { icon: Icon, color } = statusConfig[status];

  return (
    <div className="flex items-center gap-2 pl-6 py-1">
      <Icon
        size={12}
        className={`${color} ${status === "active" ? "animate-spin" : ""}`}
      />
      <span className="text-[11px] font-caption text-fg-secondary">
        {label}
      </span>
    </div>
  );
}
