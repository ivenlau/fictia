import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, ChevronsUpDown, FolderOpen, Plus } from "lucide-react";
import { useNovels } from "@/hooks/useNovel";
import { useNovelStore, enterProjectSafe } from "@/stores/novelStore";
import { useUIStore } from "@/stores/uiStore";

/** 顶栏品牌右侧：快速切换小说项目 */
export function ProjectSwitcher() {
  const { data: novels = [] } = useNovels();
  const setNovels = useNovelStore((s) => s.setNovels);
  const currentNovelId = useNovelStore((s) => s.currentNovelId);
  const currentNovel = useNovelStore((s) => s.currentNovel);
  const showGallery = useNovelStore((s) => s.showGallery);
  const setShowNewNovel = useUIStore((s) => s.setShowNewNovel);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNovels(novels);
  }, [novels, setNovels]);

  // 持久化的 currentNovelId 在列表加载后补全 currentNovel
  useEffect(() => {
    if (!currentNovelId || currentNovel) return;
    const found = novels.find((n) => n.id === currentNovelId);
    if (found) useNovelStore.getState().selectNovel(found);
  }, [currentNovelId, currentNovel, novels]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = currentNovel?.title ?? "选择项目";

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border border-subtle bg-surface-card px-2.5 py-1.5 text-[13px] font-body font-semibold text-fg-primary transition-colors hover:border-strong hover:bg-surface-elevated"
        title="切换小说项目"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <BookOpen size={13} className="text-accent" />
        <span className="max-w-[200px] truncate">{label}</span>
        <ChevronsUpDown size={12} className="text-fg-muted" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1.5 w-[280px] animate-scale-in overflow-hidden rounded-lg border border-subtle bg-surface-elevated py-1 shadow-panel"
        >
          <button
            onClick={() => {
              setOpen(false);
              showGallery();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left font-body text-xs text-fg-secondary transition-colors hover:bg-surface-card hover:text-fg-primary"
          >
            <FolderOpen size={13} className="text-accent" />
            项目概览
          </button>

          <div className="my-1 h-px bg-subtle" />

          <div className="max-h-[280px] overflow-y-auto">
            {novels.length === 0 ? (
              <p className="px-3 py-2 font-caption text-[11px] text-fg-muted">
                暂无项目
              </p>
            ) : (
              novels.map((novel) => {
                const isActive = novel.id === currentNovelId;
                return (
                  <button
                    key={novel.id}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      setOpen(false);
                      enterProjectSafe(novel);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                      isActive
                        ? "bg-accent-bg/60 text-fg-primary"
                        : "text-fg-secondary hover:bg-surface-card hover:text-fg-primary"
                    }`}
                  >
                    <BookOpen
                      size={13}
                      className={isActive ? "text-accent" : "text-fg-muted"}
                    />
                    <span className="min-w-0 flex-1 truncate font-body text-xs">
                      {novel.title}
                    </span>
                    {novel.genre && (
                      <span className="shrink-0 font-caption text-[10px] text-fg-muted">
                        {novel.genre}
                      </span>
                    )}
                    {isActive && <Check size={12} className="shrink-0 text-accent" />}
                  </button>
                );
              })
            )}
          </div>

          <div className="my-1 h-px bg-subtle" />

          <button
            onClick={() => {
              setOpen(false);
              setShowNewNovel(true);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left font-body text-xs text-fg-secondary transition-colors hover:bg-surface-card hover:text-fg-primary"
          >
            <Plus size={13} className="text-accent" />
            新建小说
          </button>
        </div>
      )}
    </div>
  );
}
