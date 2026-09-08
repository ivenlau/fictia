import { GitBranch, Bot, FileText } from "lucide-react";

interface StatusBarProps {
  novelName: string;
  branch: string;
  node: string;
  aiStatus: string;
}

export function StatusBar({
  novelName,
  branch,
  node,
  aiStatus,
}: StatusBarProps) {
  return (
    <footer className="h-7 flex items-center justify-between px-3 bg-surface-ink border-t border-subtle text-fg-secondary shrink-0 font-caption text-[11px]">
      <div className="flex items-center gap-3">
        <span className="font-medium text-fg-primary">{novelName}</span>
        <span className="flex items-center gap-1 opacity-80">
          <GitBranch size={11} className="text-cyan" />
          {branch}
        </span>
        {node && (
          <span className="flex items-center gap-1 opacity-80">
            <FileText size={11} />
            {node}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_6px_rgb(var(--c-success)/0.6)]" />
          <Bot size={11} className="text-emerald" />
          <span className="text-success">{aiStatus}</span>
        </span>
        <span className="opacity-60">UTF-8</span>
        <span className="opacity-60">Markdown</span>
      </div>
    </footer>
  );
}
