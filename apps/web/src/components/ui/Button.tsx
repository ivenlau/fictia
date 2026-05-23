import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "default" | "small";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:opacity-90 active:opacity-80",
  secondary:
    "bg-surface-secondary text-fg-primary hover:bg-surface-muted active:opacity-80",
  ghost:
    "bg-transparent text-fg-secondary hover:bg-surface-secondary active:opacity-80",
  danger:
    "bg-error text-white hover:opacity-90 active:opacity-80",
};

const sizeClasses: Record<Size, string> = {
  default: "h-8 px-3 text-[13px]",
  small: "h-6 px-2 text-[11px]",
};

export function Button({
  variant = "secondary",
  size = "default",
  children,
  className = "",
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 font-caption font-medium rounded-md transition-opacity ${
        variantClasses[variant]
      } ${sizeClasses[size]} ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
