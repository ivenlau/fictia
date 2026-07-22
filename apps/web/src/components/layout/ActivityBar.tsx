import {
  SquarePen,
  FolderTree,
  Search,
  GitBranch,
  Bot,
  Library,
  Settings,
} from "lucide-react";
import { useUIStore } from "../../stores/uiStore";

type Panel = "explorer" | "search" | "graph" | "agent" | "knowledge";

interface ActivityItem {
  icon: React.ElementType;
  panel: Panel;
  label: string;
}

const items: ActivityItem[] = [
  { icon: FolderTree, panel: "explorer", label: "Explorer" },
  { icon: Search, panel: "search", label: "Search" },
  { icon: GitBranch, panel: "graph", label: "Graph" },
  { icon: Bot, panel: "agent", label: "Agent" },
  { icon: Library, panel: "knowledge", label: "知识库" },
];

export function ActivityBar() {
  const activePanel = useUIStore((s) => s.activePanel);
  const setActivePanel = useUIStore((s) => s.setActivePanel);
  const setShowSettings = useUIStore((s) => s.setShowSettings);
  const setShowNewNovel = useUIStore((s) => s.setShowNewNovel);

  return (
    <aside className="w-14 flex flex-col items-center py-2 gap-1 bg-surface-card border-r border-subtle shrink-0">
      <button
        onClick={() => setShowNewNovel(true)}
        className="w-9 h-9 flex items-center justify-center rounded-md text-accent mb-1 hover:bg-accent-bg transition-colors"
        title="新建小说"
      >
        <SquarePen size={20} />
      </button>

      <div className="w-6 border-t border-subtle my-1" />

      {items.map((item) => (
        <button
          key={item.panel}
          onClick={() => setActivePanel(item.panel)}
          title={item.label}
          className={`w-9 h-9 flex items-center justify-center rounded-md transition-colors ${
            activePanel === item.panel
              ? "bg-accent-bg text-accent"
              : "text-fg-muted hover:bg-surface-secondary hover:text-fg-primary"
          }`}
        >
          <item.icon size={18} />
        </button>
      ))}

      <div className="flex-1" />

      <button
        onClick={() => setShowSettings(true)}
        title="Settings"
        className="w-9 h-9 flex items-center justify-center rounded-md text-fg-muted hover:bg-surface-secondary hover:text-fg-primary transition-colors"
      >
        <Settings size={18} />
      </button>
    </aside>
  );
}
