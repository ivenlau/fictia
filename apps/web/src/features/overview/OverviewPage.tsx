import { useState, useCallback, useEffect } from "react";
import {
  BookOpen,
  Plus,
  Calendar,
  Tag,
  Pencil,
  Trash2,
  RotateCcw,
  Loader2,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import type { Novel } from "@fictia/shared";
import { STAGE_ORDER, STAGE_LABELS } from "@fictia/shared";
import { useNovels, useDeleteNovel, useResetNovel } from "@/hooks/useNovel";
import { useNovelStore, enterProjectSafe } from "@/stores/novelStore";
import { useUIStore } from "@/stores/uiStore";
import { EditNovelModal } from "@/features/novel/EditNovelModal";
import { Modal, ModalShell, ModalButton } from "@/components/ui/Modal";

const statusLabels: Record<string, string> = {
  creating: "创建中",
  researching: "研究中",
  writing: "写作中",
  reviewing: "审阅中",
  completed: "已完成",
};

const statusColors: Record<string, string> = {
  creating: "border-warning/40 bg-warning/12 text-warning",
  researching: "border-cyan/40 bg-cyan/12 text-cyan",
  writing: "border-accent/40 bg-accent/12 text-accent",
  reviewing: "border-rose/40 bg-rose/12 text-rose",
  completed: "border-emerald/40 bg-emerald/12 text-emerald",
};

function readTags(novel: Novel): string[] {
  if (Array.isArray(novel.tags)) return novel.tags;
  if (typeof novel.tags === "string") {
    try {
      return JSON.parse(novel.tags);
    } catch {
      return [];
    }
  }
  return [];
}

function useSyncNovels(novels: Novel[], isLoading: boolean) {
  const setNovels = useNovelStore((s) => s.setNovels);
  useEffect(() => {
    if (!isLoading) setNovels(novels);
  }, [novels, isLoading, setNovels]);
}

/** 项目概览画廊：默认首页，卡片式 CRUD，点击进入项目主页 */
export function OverviewPage() {
  const { data: novels = [], isLoading } = useNovels();
  const clearProjectIfSelected = useNovelStore((s) => s.clearProjectIfSelected);
  const setShowNewNovel = useUIStore((s) => s.setShowNewNovel);
  const deleteNovel = useDeleteNovel();
  const resetNovel = useResetNovel();
  useSyncNovels(novels, isLoading);

  const [editing, setEditing] = useState<Novel | null>(null);
  const [deleting, setDeleting] = useState<Novel | null>(null);
  const [resetting, setResetting] = useState<Novel | null>(null);
  const [resetFromStage, setResetFromStage] = useState("all");

  const handleEnter = useCallback((novel: Novel) => {
    enterProjectSafe(novel);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deleting) return;
    const id = deleting.id;
    setDeleting(null);
    try {
      await deleteNovel.mutateAsync(id);
      clearProjectIfSelected(id);
    } catch {
      // silent
    }
  }, [deleting, deleteNovel, clearProjectIfSelected]);

  const handleReset = useCallback(async () => {
    if (!resetting) return;
    try {
      await resetNovel.mutateAsync({
        id: resetting.id,
        fromStage: resetFromStage === "all" ? undefined : resetFromStage,
      });
      setResetting(null);
    } catch {
      // silent
    }
  }, [resetting, resetNovel, resetFromStage]);

  if (isLoading && novels.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-fg-muted">
          <Sparkles size={16} className="animate-pulse" />
          <span className="font-caption text-sm">加载项目中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-6xl space-y-6 card-enter">
        <div className="flex flex-wrap items-center justify-end gap-4">
          <button
            onClick={() => setShowNewNovel(true)}
            className="btn-press flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-body text-sm font-medium text-accent-ink transition-colors hover:bg-accent-light"
          >
            <Plus size={16} />
            新建小说
          </button>
        </div>

        {novels.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-subtle bg-surface-card/50 px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent-bg text-accent animate-float-soft">
              <BookOpen size={24} />
            </div>
            <h2 className="mt-4 font-heading text-lg font-bold text-fg-primary">
              还没有小说项目
            </h2>
            <p className="mt-1 max-w-sm font-body text-sm text-fg-secondary">
              创建第一部小说，Fictia 会为它生成完整的工作区结构
            </p>
            <button
              onClick={() => setShowNewNovel(true)}
              className="btn-press mt-5 flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 font-body text-sm font-medium text-accent-ink hover:bg-accent-light"
            >
              <Plus size={16} />
              创建新小说
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {novels.map((novel, idx) => {
              const tags = readTags(novel);
              return (
                <div
                  key={novel.id}
                  className="stagger-child group relative flex flex-col overflow-hidden rounded-xl border border-subtle bg-surface-card shadow-card transition-all duration-base ease-out-expo hover-lift hover:border-accent/40"
                  style={{ ["--stagger-i" as string]: Math.min(idx, 12) }}
                >
                  <button
                    onClick={() => handleEnter(novel)}
                    className="flex flex-1 flex-col p-4 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      {novel.genre && (
                        <span className="rounded-full border border-violet/35 bg-violet/12 px-2 py-0.5 text-[10px] font-semibold text-violet">
                          {novel.genre}
                        </span>
                      )}
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          statusColors[novel.status] ?? "border-subtle text-fg-muted"
                        }`}
                      >
                        {statusLabels[novel.status] ?? novel.status}
                      </span>
                    </div>

                    <h3 className="mt-2.5 font-display text-[17px] font-bold leading-snug text-fg-primary transition-colors group-hover:text-accent">
                      {novel.title}
                    </h3>
                    <p className="mt-1.5 line-clamp-2 min-h-[2.5em] font-body text-xs leading-relaxed text-fg-secondary">
                      {novel.description || "暂无简介"}
                    </p>

                    {tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {tags.slice(0, 4).map((t) => (
                          <span
                            key={t}
                            className="rounded border border-subtle bg-surface-muted px-1.5 py-0.5 font-caption text-[10px] text-fg-muted"
                          >
                            {t}
                          </span>
                        ))}
                        {tags.length > 4 && (
                          <span className="font-caption text-[10px] text-fg-muted">
                            +{tags.length - 4}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="mt-auto flex items-center gap-3 pt-4 font-caption text-[11px] text-fg-muted">
                      <span className="flex items-center gap-1">
                        <Tag size={11} />
                        {novel.targetChapters} 章目标
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar size={11} />
                        {new Date(novel.updatedAt || novel.createdAt).toLocaleDateString("zh-CN")}
                      </span>
                      <span className="ml-auto flex items-center gap-0.5 text-accent opacity-0 transition-opacity group-hover:opacity-100">
                        进入
                        <ChevronRight size={12} />
                      </span>
                    </div>
                  </button>

                  <div className="flex items-center gap-1 border-t border-subtle bg-surface-secondary/60 px-2 py-1.5">
                    <button
                      onClick={() => setEditing(novel)}
                      className="flex items-center gap-1 rounded px-2 py-1 font-caption text-[11px] text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg-primary"
                      title="编辑"
                    >
                      <Pencil size={12} />
                      编辑
                    </button>
                    <button
                      onClick={() => {
                        setResetFromStage("all");
                        setResetting(novel);
                      }}
                      className="flex items-center gap-1 rounded px-2 py-1 font-caption text-[11px] text-warning/90 transition-colors hover:bg-warning/10"
                      title="重置"
                    >
                      <RotateCcw size={12} />
                      重置
                    </button>
                    <div className="flex-1" />
                    <button
                      onClick={() => setDeleting(novel)}
                      className="flex items-center gap-1 rounded px-2 py-1 font-caption text-[11px] text-error/90 transition-colors hover:bg-error/10"
                      title="删除"
                    >
                      <Trash2 size={12} />
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && <EditNovelModal novel={editing} onClose={() => setEditing(null)} />}

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        maxWidthClass="w-full max-w-[400px]"
      >
        <ModalShell
          title="确认删除"
          description={`确定要删除小说「${deleting?.title}」吗？此操作不可撤销，所有章节和文档将被永久删除。`}
          footer={
            <>
              <ModalButton onClick={() => setDeleting(null)}>取消</ModalButton>
              <ModalButton tone="danger" onClick={handleDelete} disabled={deleteNovel.isPending}>
                {deleteNovel.isPending ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 size={14} className="animate-spin" />
                    删除中...
                  </span>
                ) : (
                  "确认删除"
                )}
              </ModalButton>
            </>
          }
        />
      </Modal>

      <Modal
        open={!!resetting}
        onClose={() => setResetting(null)}
        maxWidthClass="w-full max-w-[400px]"
      >
        <ModalShell
          title="重置小说"
          description="选择重置起点：将从该阶段起清空产出（含后续所有阶段），前面已确认的阶段保留。"
          footer={
            <>
              <ModalButton onClick={() => setResetting(null)}>取消</ModalButton>
              <ModalButton tone="warning" onClick={handleReset} disabled={resetNovel.isPending}>
                {resetNovel.isPending ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 size={14} className="animate-spin" />
                    确认重置
                  </span>
                ) : (
                  "确认重置"
                )}
              </ModalButton>
            </>
          }
        >
          <select
            value={resetFromStage}
            onChange={(e) => setResetFromStage(e.target.value)}
            className="mb-3 w-full rounded-md border border-subtle bg-surface-card px-3 py-2 font-body text-sm text-fg-primary focus:border-accent focus:outline-none"
          >
            <option value="all">重置全部（恢复新建状态）</option>
            {STAGE_ORDER.map((s) => (
              <option key={s} value={s}>
                从「{(STAGE_LABELS as Record<string, string>)[s]}」开始重置
              </option>
            ))}
          </select>
          <p className="mb-5 font-body text-xs text-fg-muted">
            {resetFromStage === "all"
              ? "清空所有 Agent 产出、章节、聊天记录，恢复到新建状态（保留基本信息）。"
              : `将删除「${(STAGE_LABELS as Record<string, string>)[resetFromStage]}」及其后所有阶段的产出；前面阶段与聊天记录保留。`}
          </p>
        </ModalShell>
      </Modal>
    </div>
  );
}
