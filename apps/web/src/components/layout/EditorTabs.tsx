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

  const hasOverview = openFiles.some((f) => f.type === "overview");
  const tabs = hasOverview
    ? openFiles
    : [{ id: "__overview__", type: "overview" as const, label: "概览", path: "" }, ...openFiles];
  const activeTabId = activeFileId ?? "__overview__";

  return (
    <div className="flex h-9 items-stretch border-b border-subtle bg-surface-secondary shrink-0 overflow-x-auto">
      {tabs.map((file) => {
        const isActive = file.id === activeTabId;
        const Icon = fileIcons[file.type] ?? FileText;
        const isVirtualOverview = file.id === "__overview__";

        return (
          <button
            key={file.id}
            onClick={() => setActiveFile(file.id)}
            className={`group relative flex h-full shrink-0 items-center gap-1.5 border-r border-subtle px-3 text-[12px] font-caption transition-colors ${
              isActive
                ? "bg-surface-primary text-fg-primary"
                : "text-fg-muted hover:bg-surface-primary/50 hover:text-fg-secondary"
            }`}
          >
            {isActive && (
              <span className="absolute inset-x-0 top-0 h-0.5 bg-accent" />
            )}
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
                className="ml-1 rounded p-0.5 opacity-0 transition-all hover:bg-surface-elevated hover:text-error group-hover:opacity-100"
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
