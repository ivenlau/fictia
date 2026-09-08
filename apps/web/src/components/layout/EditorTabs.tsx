import { useLayoutEffect, useRef, useState } from "react";
import { X, FileText, BookOpen } from "lucide-react";
import { useEditorStore } from "../../stores/editorStore";

const fileIcons = {
  workspace: FileText,
  chapter: BookOpen,
  file: FileText,
  overview: BookOpen,
} as const;

export function EditorTabs() {
  const openFiles = useEditorStore((s) => s.openFiles);
  const activeFileId = useEditorStore((s) => s.activeFileId);
  const setActiveFile = useEditorStore((s) => s.setActiveFile);
  const closeFile = useEditorStore((s) => s.closeFile);

  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  const hasOverview = openFiles.some((f) => f.type === "overview");
  const tabs = hasOverview
    ? openFiles
    : [{ id: "__overview__", type: "overview" as const, label: "概览", path: "" }, ...openFiles];
  const activeTabId = activeFileId ?? "__overview__";

  useLayoutEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`[data-tab-id="${activeTabId}"]`);
    if (!el) {
      setIndicator(null);
      return;
    }
    const update = () => {
      setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeTabId, tabs.length, openFiles]);

  return (
    <div
      ref={listRef}
      className="relative flex h-9 items-stretch border-b border-subtle bg-surface-secondary shrink-0 overflow-x-auto"
    >
      {indicator && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 z-10 h-0.5 rounded-b-sm bg-accent transition-all duration-base ease-out-expo"
          style={{ left: indicator.left, width: indicator.width }}
        />
      )}
      {tabs.map((file) => {
        const isActive = file.id === activeTabId;
        const Icon = fileIcons[file.type] ?? FileText;
        const isVirtualOverview = file.id === "__overview__";

        return (
          <button
            key={file.id}
            data-tab-id={file.id}
            onClick={() => setActiveFile(file.id)}
            className={`group relative flex h-full shrink-0 items-center gap-1.5 border-r border-subtle px-3 text-[12px] font-caption transition-colors duration-fast ${
              isActive
                ? "bg-surface-primary text-fg-primary"
                : "text-fg-muted hover:bg-surface-primary/50 hover:text-fg-secondary"
            }`}
          >
            <Icon size={13} className={isActive ? "text-accent" : ""} />
            <span className="max-w-[140px] truncate">{file.label}</span>
            {!isVirtualOverview && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  closeFile(file.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    closeFile(file.id);
                  }
                }}
                className="ml-1 rounded p-0.5 opacity-0 transition-all duration-fast hover:bg-surface-elevated hover:text-error group-hover:opacity-100"
                aria-label={`Close ${file.label}`}
              >
                <X size={12} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
