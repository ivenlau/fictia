import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "default" | "small";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-ink font-semibold hover:bg-accent-light active:bg-accent-deep shadow-[0_1px_0_rgb(var(--c-text)/0.12)_inset]",
  secondary:
    "bg-surface-elevated text-fg-primary border border-subtle hover:border-strong hover:bg-surface-muted",
  ghost:
    "bg-transparent text-fg-secondary hover:bg-surface-elevated hover:text-fg-primary",
  danger:
    "bg-error text-accent-ink font-semibold hover:opacity-90 active:opacity-80",
  outline:
    "bg-transparent text-accent border border-accent/40 hover:bg-accent/10 hover:border-accent/70",
};

const sizeClasses: Record<Size, string> = {
  default: "h-8 px-3.5 text-[13px] rounded-md",
  small: "h-6 px-2.5 text-[11px] rounded-sm",
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
      className={`inline-flex items-center justify-center gap-1.5 font-caption font-medium transition-all duration-150 ease-out-expo ${
        variantClasses[variant]
      } ${sizeClasses[size]} ${
        disabled ? "opacity-40 cursor-not-allowed pointer-events-none" : "active:scale-[0.97]"
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
