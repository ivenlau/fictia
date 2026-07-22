import { useCallback, useRef, useState } from "react";
import { Library, Search as SearchIcon, Users, Network } from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import { useUIStore } from "@/stores/uiStore";
import { IndexManager } from "@/components/knowledge/IndexManager";
import { KnowledgeSearch } from "@/components/knowledge/KnowledgeSearch";
import { EntityBrowser } from "@/components/knowledge/EntityBrowser";
import { GraphSection } from "@/components/knowledge/GraphSection";

type Tab = "search" | "entity" | "graph";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "search", label: "知识", icon: SearchIcon },
  { key: "entity", label: "实体", icon: Users },
  { key: "graph", label: "图谱", icon: Network },
];

export function KnowledgePanel() {
  const [tab, setTab] = useState<Tab>("search");
  const openFiles = useEditorStore((s) => s.openFiles);
  const activeFileId = useEditorStore((s) => s.activeFileId);
  const activeFile = openFiles.find((f) => f.id === activeFileId);
  const novelId = activeFile?.novelId;
  const novelTitle = activeFile?.novelTitle;

  const explorerWidth = useUIStore((s) => s.explorerWidth);
  const setExplorerWidth = useUIStore((s) => s.setExplorerWidth);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startWidth: explorerWidth };
      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = ev.clientX - dragRef.current.startX;
        setExplorerWidth(dragRef.current.startWidth + delta);
      };
      const handleMouseUp = () => {
        dragRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [explorerWidth, setExplorerWidth],
  );

  const resizeHandle = (
    <div
      onMouseDown={handleResizeStart}
      className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent/30 transition-colors z-10"
    />
  );

  if (!novelId) {
    return (
      <div className="flex flex-col h-full relative">
        <div className="px-3 pt-3 pb-2">
          <p className="font-caption text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
            知识库
          </p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <Library size={24} className="text-fg-muted/40 mb-2" />
          <p className="font-caption text-[11px] text-fg-muted">请先打开一个作品</p>
        </div>
        {resizeHandle}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      <div className="px-3 pt-3 pb-1">
        <p className="font-caption text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
          知识库
        </p>
        {novelTitle && (
          <p className="font-body text-xs text-fg-primary truncate">
            {novelTitle}
          </p>
        )}
      </div>

      <IndexManager novelId={novelId} />

      <div className="flex items-center gap-1 px-3 py-2 border-b border-subtle">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1 rounded-md px-2 py-1 font-body text-[11px] transition-colors ${
                active
                  ? "bg-accent-bg text-accent"
                  : "text-fg-muted hover:bg-surface-secondary hover:text-fg-primary"
              }`}
            >
              <Icon size={12} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === "search" ? (
          <KnowledgeSearch novelId={novelId} novelTitle={novelTitle} />
        ) : tab === "entity" ? (
          <EntityBrowser novelId={novelId} />
        ) : (
          <GraphSection novelId={novelId} />
        )}
      </div>

      {resizeHandle}
    </div>
  );
}
