import { Feather } from "lucide-react";

interface TopBarProps {
  path: string;
}

export function TopBar({ path }: TopBarProps) {
  return (
    <header className="h-12 flex items-center gap-2 px-4 bg-surface-card border-b border-subtle shrink-0">
      <Feather size={16} className="text-accent" />
      <span className="font-caption text-[13px] text-fg-secondary truncate">
        {path}
      </span>
    </header>
  );
}
