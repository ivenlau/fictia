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
import { useNovelStore } from "../../stores/novelStore";
import { FileViewer } from "../../features/workspace/FileViewer";
import { WorkspaceRootView } from "../../features/workspace/WorkspaceRootView";
import { OverviewPage } from "../../features/overview/OverviewPage";
import { GALLERY_TAB_ID, galleryTab } from "./galleryTab";

interface IDELayoutProps {
  children?: ReactNode;
}

export function IDELayout(_props: IDELayoutProps) {
  const activeFileId = useEditorStore((s) => s.activeFileId);
  const openFiles = useEditorStore((s) => s.openFiles);
  const activePanel = useUIStore((s) => s.activePanel);
  const explorerVisible = useUIStore((s) => s.explorerVisible);
  const explorerWidth = useUIStore((s) => s.explorerWidth);
  const currentNovel = useNovelStore((s) => s.currentNovel);

  const showSidePanel =
    explorerVisible &&
    (activePanel === "search" ||
      activePanel === "agent" ||
      activePanel === "explorer" ||
      activePanel === "debug" ||
      activePanel === "knowledge" ||
      activePanel === "material" ||
      activePanel === "tools");

  const novelName = currentNovel?.title ?? "Fictia";

  // 默认首标签为「概览」画廊；其后是已打开文件
  const tabs = useMemo(() => {
    const rest = openFiles.filter((f) => f.id !== GALLERY_TAB_ID);
    return [galleryTab, ...rest];
  }, [openFiles]);

  const activeTabId = activeFileId ?? GALLERY_TAB_ID;
  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface-primary text-fg-primary">
      <TopBar />

      <div className="flex flex-1 overflow-hidden">
        <ActivityBar />
        {showSidePanel && (
          <aside
            className="panel-enter relative z-30 flex shrink-0 flex-col overflow-hidden border-r border-subtle bg-surface-secondary transition-[width] duration-base ease-out-expo"
            style={{ width: explorerWidth }}
          >
            <div key={activePanel} className="panel-swap flex min-h-0 flex-1 flex-col overflow-hidden">
              {activePanel === "knowledge" ? (
                <KnowledgePanel />
              ) : activePanel === "material" ? (
                <MaterialPanel />
              ) : activePanel === "search" ? (
                <SearchPanel />
              ) : activePanel === "agent" ? (
                <ChatPanel />
              ) : activePanel === "debug" ? (
                <DebugPanel />
              ) : activePanel === "tools" ? (
                <CustomToolsPanel />
              ) : (
                <Explorer />
              )}
            </div>
          </aside>
        )}
        <div className="flex flex-1 flex-col overflow-hidden">
          <EditorTabs />
          <main className="relative flex flex-1 flex-col overflow-hidden bg-surface-primary">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <div
                  key={tab.id}
                  className="absolute inset-0 flex flex-col overflow-hidden"
                  style={{ display: isActive ? "flex" : "none" }}
                >
                  {tab.id === GALLERY_TAB_ID || tab.type === "gallery" ? (
                    <OverviewPage />
                  ) : tab.type === "overview" ? (
                    <WorkspaceRootView novelId={tab.novelId} />
                  ) : (
                    <FileViewer fileId={tab.id} />
                  )}
                </div>
              );
            })}
            {!activeTab && <OverviewPage />}
          </main>
        </div>
      </div>

      <StatusBar novelName={novelName} branch="main" node="" aiStatus="AI Ready" />
    </div>
  );
}
