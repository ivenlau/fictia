import { useCallback, useRef, useState } from "react";
import { BookMarked, Boxes, BookOpen, Eye, Layers, MessageSquareText } from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import { useUIStore } from "@/stores/uiStore";
import { GenreCardSection } from "@/components/material/GenreCardSection";
import { CraftSection } from "@/components/material/CraftSection";
import { InjectionPreviewSection } from "@/components/material/InjectionPreviewSection";
import { PreferencesSection } from "@/components/material/PreferencesSection";
import { UserMaterialsManager } from "@/components/material/UserMaterialsManager";
import { ReferenceSection } from "@/components/material/ReferenceSection";

type Tab = "genre" | "craft" | "prompt" | "reference" | "preview";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "genre", label: "体裁卡", icon: Layers },
  { key: "craft", label: "技法", icon: BookOpen },
  { key: "prompt", label: "提示词", icon: MessageSquareText },
  { key: "reference", label: "对标", icon: BookMarked },
  { key: "preview", label: "注入预览", icon: Eye },
];

export function MaterialPanel() {
  const [tab, setTab] = useState<Tab>("genre");
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
            素材库
          </p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <Boxes size={24} className="text-fg-muted/40 mb-2" />
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
          素材库
        </p>
        {novelTitle && (
          <p className="font-body text-xs text-fg-primary truncate">{novelTitle}</p>
        )}
      </div>

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
        {tab === "genre" ? (
          <GenreCardSection novelId={novelId} />
        ) : tab === "craft" ? (
          <CraftSection novelId={novelId} />
        ) : tab === "prompt" ? (
          <div className="flex flex-col h-full overflow-y-auto">
            <PreferencesSection novelId={novelId} />
            <UserMaterialsManager novelId={novelId} type="prompt-snippet" />
          </div>
        ) : tab === "reference" ? (
          <ReferenceSection novelId={novelId} />
        ) : (
          <InjectionPreviewSection novelId={novelId} />
        )}
      </div>

      {resizeHandle}
    </div>
  );
}
