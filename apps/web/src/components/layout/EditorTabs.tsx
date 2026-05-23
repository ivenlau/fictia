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

  // Show overview tab always, plus open files
  const hasOverview = openFiles.some((f) => f.type === "overview");
  const tabs = hasOverview ? openFiles : [{ id: "__overview__", type: "overview" as const, label: "概览", path: "" }, ...openFiles];
  const activeTabId = activeFileId ?? "__overview__";

  return (
    <div className="flex items-end h-9 bg-surface-secondary border-b border-subtle shrink-0 overflow-x-auto">
      {tabs.map((file) => {
        const isActive = file.id === activeTabId;
        const Icon = fileIcons[file.type] ?? FileText;
        const isVirtualOverview = file.id === "__overview__";

        return (
          <button
            key={file.id}
            onClick={() => setActiveFile(file.id)}
            className={`group flex items-center gap-1.5 px-3 h-full text-[13px] font-caption border-r border-subtle shrink-0 transition-colors ${
              isActive
                ? "bg-surface-card text-fg-primary"
                : "bg-surface-secondary text-fg-muted hover:text-fg-secondary"
            }`}
          >
            <Icon size={14} />
            <span className="truncate max-w-[120px]">{file.label}</span>
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
                className="ml-1 p-0.5 rounded hover:bg-surface-secondary opacity-0 group-hover:opacity-100 transition-opacity"
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
