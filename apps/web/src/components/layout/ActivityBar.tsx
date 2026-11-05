import {
  SquarePen,
  FolderTree,
  Search,
  Bug,
  Bot,
  Library,
  Boxes,
  Settings,
  Wrench,
} from "lucide-react";
import { useUIStore } from "../../stores/uiStore";

type Panel = "explorer" | "search" | "debug" | "agent" | "knowledge" | "material" | "tools";

interface ActivityItem {
  icon: React.ElementType;
  panel: Panel;
  label: string;
}

const items: ActivityItem[] = [
  { icon: FolderTree, panel: "explorer", label: "资源管理" },
  { icon: Search, panel: "search", label: "搜索" },
  { icon: Bug, panel: "debug", label: "调试" },
  { icon: Bot, panel: "agent", label: "Agent" },
  { icon: Wrench, panel: "tools", label: "自定义工具" },
  { icon: Library, panel: "knowledge", label: "知识库" },
  { icon: Boxes, panel: "material", label: "素材库" },
];

export function ActivityBar() {
  const activePanel = useUIStore((s) => s.activePanel);
  const explorerVisible = useUIStore((s) => s.explorerVisible);
  const setActivePanel = useUIStore((s) => s.setActivePanel);
  const openSettings = useUIStore((s) => s.openSettings);
  const setShowNewNovel = useUIStore((s) => s.setShowNewNovel);

  return (
    <aside className="w-14 flex flex-col items-center py-3 gap-1.5 bg-surface-secondary border-r border-subtle shrink-0">
      <button
        onClick={() => setShowNewNovel(true)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-subtle bg-surface-card text-fg-muted transition-colors hover:border-strong hover:bg-surface-elevated hover:text-fg-primary"
        title="新建小说"
      >
        <SquarePen size={17} />
      </button>

      <div className="my-1.5 h-px w-6 bg-strong" />

      {items.map((item) => {
        const isActive = activePanel === item.panel && explorerVisible;
        return (
          <button
            key={item.panel}
            onClick={() => setActivePanel(item.panel)}
            title={item.label}
            className={`group relative flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-fast ease-out-expo ${
              isActive
                ? "bg-surface-elevated border border-strong text-accent shadow-glow"
                : "border border-transparent text-fg-muted hover:bg-surface-elevated/70 hover:text-fg-secondary"
            }`}
          >
            <item.icon size={17} />
            {isActive && (
              <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r bg-accent" />
            )}
          </button>
        );
      })}

      <div className="flex-1" />

      <button
        onClick={() => openSettings()}
        title="设置"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-elevated hover:text-fg-primary"
      >
        <Settings size={17} />
      </button>
    </aside>
  );
}
