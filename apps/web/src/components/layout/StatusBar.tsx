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
    <footer className="h-8 flex items-center justify-between px-3 bg-surface-inverse text-fg-inverse shrink-0">
      {/* Left side */}
      <div className="flex items-center gap-3 text-[12px] font-caption">
        <span className="font-medium">{novelName}</span>
        <span className="flex items-center gap-1 opacity-80">
          <GitBranch size={12} />
          {branch}
        </span>
        <span className="flex items-center gap-1 opacity-80">
          <FileText size={12} />
          {node}
        </span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3 text-[12px] font-caption">
        <span className="flex items-center gap-1 opacity-80">
          <Bot size={12} />
          {aiStatus}
        </span>
        <span className="opacity-60">UTF-8</span>
      </div>
    </footer>
  );
}
