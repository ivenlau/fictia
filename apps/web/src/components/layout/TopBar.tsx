import { Feather, BookOpen, ChevronsUpDown } from "lucide-react";
import { useEditorStore } from "../../stores/editorStore";
import { ThemeSwitcher } from "./ThemeSwitcher";

interface TopBarProps {
  path: string;
}

/** 顶栏：品牌 + 作品切换 + 右侧主题。搜索/设置在 ActivityBar，避免重复。 */
export function TopBar({ path }: TopBarProps) {
  const openFiles = useEditorStore((s) => s.openFiles);
  const activeFileId = useEditorStore((s) => s.activeFileId);
  const setActiveFile = useEditorStore((s) => s.setActiveFile);

  const uniqueNovels = openFiles.reduce<{ id: string; title: string }[]>((acc, f) => {
    if (f.novelId && f.novelTitle && !acc.some((n) => n.id === f.novelId)) {
      acc.push({ id: f.novelId, title: f.novelTitle });
    }
    return acc;
  }, []);

  const activeFile = openFiles.find((f) => f.id === activeFileId);
  const currentNovel = activeFile?.novelId
    ? { id: activeFile.novelId, title: activeFile.novelTitle || path }
    : uniqueNovels[0];

  return (
    <header className="h-[52px] flex items-center gap-3 px-4 bg-surface-secondary border-b border-subtle shrink-0">
      <div className="gradient-brand flex h-7 w-7 items-center justify-center rounded-md shadow-[0_0_16px_rgb(var(--c-accent)/0.25)]">
        <Feather size={14} className="text-accent-ink" />
      </div>
      <span className="font-display text-[15px] font-bold tracking-tight text-fg-primary">
        Fictia
      </span>

      {currentNovel && (
        <button
          onClick={() => {
            const tab =
              openFiles.find((f) => f.novelId === currentNovel.id && f.type === "overview") ??
              openFiles.find((f) => f.novelId === currentNovel.id);
            if (tab) setActiveFile(tab.id);
          }}
          className="flex items-center gap-2 rounded-md border border-subtle bg-surface-card px-2.5 py-1.5 text-[13px] font-body font-semibold text-fg-primary transition-colors hover:border-strong hover:bg-surface-elevated"
        >
          <BookOpen size={13} className="text-accent" />
          <span className="max-w-[220px] truncate">{currentNovel.title}</span>
          {uniqueNovels.length > 1 && (
            <ChevronsUpDown size={12} className="text-fg-muted" />
          )}
        </button>
      )}

      <div className="flex-1" />

      <ThemeSwitcher />
    </header>
  );
}
