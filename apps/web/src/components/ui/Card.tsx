import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={`bg-surface-card border border-subtle rounded-lg p-4 ${className}`}
    >
      {children}
    </div>
  );
}
