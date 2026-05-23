import type { ReactNode } from "react";

type Variant = "default" | "success" | "warning" | "info";

interface TagProps {
  variant?: Variant;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  default: "bg-accent-bg text-accent",
  success: "bg-green-100 text-green-700",
  warning: "bg-yellow-100 text-yellow-700",
  info: "bg-blue-100 text-blue-700",
};

export function Tag({ variant = "default", children }: TagProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-caption font-medium ${variantClasses[variant]}`}
    >
      {children}
    </span>
  );
}
