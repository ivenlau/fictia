import { useEffect, useRef, useState } from "react";

type Status = "completed" | "running" | "failed" | "idle" | "pending_confirm";

interface StatusBadgeProps {
  status: Status;
  label: string;
}

const dotClasses: Record<Status, string> = {
  completed: "bg-accent shadow-[0_0_8px_rgb(var(--c-accent)/0.55)]",
  running: "bg-warning animate-status-glow animate-pulse-soft",
  failed: "bg-error shadow-[0_0_8px_rgb(var(--c-rose)/0.5)]",
  idle: "bg-fg-muted",
  pending_confirm: "bg-warning animate-pending-breathe",
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const prev = useRef(status);
  const [shake, setShake] = useState(false);
  const [burst, setBurst] = useState(false);

  useEffect(() => {
    if (prev.current === status) return;
    const was = prev.current;
    prev.current = status;
    if (status === "failed" && was !== "failed") {
      setShake(true);
      const t = window.setTimeout(() => setShake(false), 200);
      return () => window.clearTimeout(t);
    }
    if (status === "completed" && was !== "completed") {
      setBurst(true);
      const t = window.setTimeout(() => setBurst(false), 600);
      return () => window.clearTimeout(t);
    }
  }, [status]);

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[12px] font-caption text-fg-secondary ${
        shake ? "animate-shake" : ""
      }`}
    >
      <span className="relative inline-flex">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClasses[status]}`} />
        {burst && status === "completed" && (
          <span className="absolute inset-0 h-1.5 w-1.5 rounded-full bg-accent animate-success-burst" />
        )}
      </span>
      {label}
    </span>
  );
}
