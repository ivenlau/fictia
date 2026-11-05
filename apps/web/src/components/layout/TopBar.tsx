import { Feather } from "lucide-react";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { ThemeSwitcher } from "./ThemeSwitcher";

/** 顶栏：品牌 + 项目快速切换 + 右侧主题。搜索/设置在 ActivityBar。 */
export function TopBar() {
  return (
    <header className="h-[52px] flex items-center gap-3 px-4 bg-surface-secondary border-b border-subtle shrink-0">
      <div className="gradient-brand flex h-7 w-7 items-center justify-center rounded-md shadow-[0_0_16px_rgb(var(--c-accent)/0.25)]">
        <Feather size={14} className="text-accent-ink" />
      </div>
      <span className="font-display text-[15px] font-bold tracking-tight text-fg-primary">
        Fictia
      </span>

      <ProjectSwitcher />

      <div className="flex-1" />

      <ThemeSwitcher />
    </header>
  );
}
