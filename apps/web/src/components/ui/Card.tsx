import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}

export function Card({ children, className = "", interactive = false }: CardProps) {
  return (
    <div
      className={`rounded-lg border border-subtle bg-surface-card p-4 shadow-card transition-all duration-200 ease-out-expo ${
        interactive ? "hover-lift hover:border-strong cursor-pointer" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
