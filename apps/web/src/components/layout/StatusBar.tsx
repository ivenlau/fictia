import { useEffect, useState } from "react";
import { GitBranch, Bot, FileText } from "lucide-react";

interface StatusBarProps {
  novelName: string;
  branch: string;
  node: string;
  aiStatus: string;
}

/** 全局成功波纹：window.dispatchEvent(new CustomEvent("fictia:success")) */
export function StatusBar({
  novelName,
  branch,
  node,
  aiStatus,
}: StatusBarProps) {
  const [sweep, setSweep] = useState(false);

  useEffect(() => {
    let timer: number | undefined;
    const on = () => {
      setSweep(false);
      requestAnimationFrame(() => setSweep(true));
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setSweep(false), 500);
    };
    window.addEventListener("fictia:success", on);
    return () => {
      window.removeEventListener("fictia:success", on);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <footer className="relative h-7 flex items-center justify-between overflow-hidden px-3 bg-surface-ink border-t border-subtle text-fg-secondary shrink-0 font-caption text-[11px]">
      {sweep && <span className="success-sweep pointer-events-none absolute inset-0 z-10" />}
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
