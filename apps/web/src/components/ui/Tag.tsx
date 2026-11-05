import type { ReactNode } from "react";

type Variant = "default" | "success" | "warning" | "info" | "danger" | "violet" | "cyan" | "rose";

interface TagProps {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  default: "bg-accent/12 text-accent border-accent/35",
  success: "bg-accent-bg text-accent border-accent/35",
  warning: "bg-warning/12 text-warning border-warning/35",
  info: "bg-info/12 text-info border-info/35",
  danger: "bg-error/12 text-error border-error/35",
  violet: "bg-violet/12 text-violet border-violet/35",
  cyan: "bg-cyan/12 text-cyan border-cyan/35",
  rose: "bg-rose/12 text-rose border-rose/35",
};

export function Tag({ variant = "default", children, className = "" }: TagProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-body font-semibold transition-colors ${
        variantClasses[variant]
      } ${className}`}
    >
      {children}
    </span>
  );
}
