import { useMemo } from "react";
import type { ReactNode } from "react";
import { TopBar } from "./TopBar";
import { ActivityBar } from "./ActivityBar";
import { Explorer } from "./Explorer";
import { SearchPanel } from "./SearchPanel";
import { ChatPanel } from "./ChatPanel";
import { DebugPanel } from "./DebugPanel";
import { KnowledgePanel } from "./KnowledgePanel";
import { MaterialPanel } from "./MaterialPanel";
import { CustomToolsPanel } from "../tools/CustomToolsPanel";
import { EditorTabs } from "./EditorTabs";
import { StatusBar } from "./StatusBar";
import { useEditorStore } from "../../stores/editorStore";
import { useUIStore } from "../../stores/uiStore";
import { FileViewer } from "../../features/workspace/FileViewer";
import { WorkspaceRootView } from "../../features/workspace/WorkspaceRootView";

interface IDELayoutProps {
  children: ReactNode;
}

export function IDELayout({ children }: IDELayoutProps) {
  const activeFileId = useEditorStore((s) => s.activeFileId);
  const openFiles = useEditorStore((s) => s.openFiles);
  const activeFile = openFiles.find((f) => f.id === activeFileId);
  const activePanel = useUIStore((s) => s.activePanel);
  const explorerVisible = useUIStore((s) => s.explorerVisible);
  const explorerWidth = useUIStore((s) => s.explorerWidth);

  const showSidePanel = explorerVisible && (activePanel === "search" || activePanel === "agent" || activePanel === "explorer" || activePanel === "debug" || activePanel === "knowledge" || activePanel === "material" || activePanel === "tools");

  const novelName = activeFile?.novelTitle ?? "Fictia";

  // Ensure overview tab exists
  const tabsWithOverview = useMemo(() => {
    const hasOverview = openFiles.some((f) => f.type === "overview");
    if (!hasOverview && openFiles.length > 0) {
      // Add a virtual overview tab
      return [{ id: "__overview__", type: "overview" as const, label: "概览", path: "", novelId: openFiles[0]?.novelId, novelTitle: openFiles[0]?.novelTitle }, ...openFiles];
    }
    if (openFiles.length === 0) {
      return [{ id: "__overview__", type: "overview" as const, label: "概览", path: "" }];
    }
    return openFiles;
  }, [openFiles]);

  // Determine which tab to show
  const activeTabId = activeFileId ?? "__overview__";

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-surface-primary text-fg-primary">
      <TopBar path={novelName} />

      <div className="flex flex-1 overflow-hidden">
        <ActivityBar />
        {showSidePanel && (
          <aside
            className="flex flex-col bg-surface-card border-r border-subtle shrink-0 overflow-hidden"
            style={{ width: explorerWidth }}
          >
            {activePanel === "knowledge" ? <KnowledgePanel /> : activePanel === "material" ? <MaterialPanel /> : activePanel === "search" ? <SearchPanel /> : activePanel === "agent" ? <ChatPanel /> : activePanel === "debug" ? <DebugPanel /> : activePanel === "tools" ? <CustomToolsPanel /> : <Explorer />}
          </aside>
        )}
        <div className="flex-1 flex flex-col overflow-hidden">
          <EditorTabs />
          <main className="flex-1 flex flex-col overflow-hidden relative">
            {tabsWithOverview.map((file) => {
              const isActive = file.id === activeTabId;
              return (
                <div
                  key={file.id}
                  className="absolute inset-0 flex flex-col overflow-hidden"
                  style={{ display: isActive ? "flex" : "none" }}
                >
                  {file.type === "overview" ? (
                    <WorkspaceRootView novelId={file.novelId} />
                  ) : (
                    <FileViewer fileId={file.id} />
                  )}
                </div>
              );
            })}
          </main>
        </div>
      </div>

      <StatusBar
        novelName={novelName}
        branch="main"
        node=""
        aiStatus="AI Ready"
      />
    </div>
  );
}
