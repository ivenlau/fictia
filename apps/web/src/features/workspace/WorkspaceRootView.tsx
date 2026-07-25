import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Plus,
  Sparkles,
  Tag,
  Calendar,
  Loader2,
  PenLine,
  Eye,
  RefreshCw,
  Download,
  Play,
  Pause,
  CheckCircle2,
  Pencil,
  Trash2,
  RotateCcw,
  ChevronDown,
  FileText,
  BookMarked,
} from "lucide-react";
import { useNovelStore } from "@/stores/novelStore";
import { useUIStore } from "@/stores/uiStore";
import { useAgentStore } from "@/stores/agentStore";
import { useNovel, useDeleteNovel, useResetNovel } from "@/hooks/useNovel";
import { useEditorStore } from "@/stores/editorStore";
import { novelsApi } from "@/api/novels";
import { pipelinesApi } from "@/api/pipelines";
import { EditNovelModal } from "@/features/novel/EditNovelModal";
import { exportMarkdown, exportEpub, exportTxt } from "@/utils/export";
import { WorkspaceTasks } from "./WorkspaceTasks";
import { countWords } from "@/lib/markdown";
import type { WorkspaceFile } from "@fictia/shared";

interface WorkspaceRootViewProps {
  novelId?: string;
}

interface ChapterFileInfo {
  path: string;
  number: number;
  title: string;
  wordCount: number;
  hasContent: boolean;
  content: string;
}

function parseChapterFiles(files: WorkspaceFile[]): ChapterFileInfo[] {
  return files
    .filter((f) => /^chapters\/ch\d+_act\d+-.*\.md$/.test(f.path))
    .map((f) => {
      const numMatch = f.path.match(/ch(\d+)_act\d+/);
      const number = numMatch ? parseInt(numMatch[1]) : 0;
      const titleMatch = (f.content ?? "").match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : "";
      const wordCount = countWords(f.content ?? "");
      return {
        path: f.path,
        number,
        title,
        wordCount,
        hasContent: !!(f.content && f.content.trim().length > 0),
        content: f.content ?? "",
      };
    })
    .sort((a, b) => a.number - b.number);
}

export function WorkspaceRootView({ novelId: propNovelId }: WorkspaceRootViewProps = {}) {
  const { novelId: paramNovelId } = useParams<{ novelId: string }>();
  const novelId = propNovelId ?? paramNovelId;
  const setShowNewNovel = useUIStore((s) => s.setShowNewNovel);
  const setCurrentNovel = useNovelStore((s) => s.setCurrentNovel);

  const queryClient = useQueryClient();
  const { data: novel, isLoading } = useNovel(novelId);
  const deleteNovel = useDeleteNovel();
  const resetNovel = useResetNovel();
  const closeFile = useEditorStore((s) => s.closeFile);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const setWritingChapter = useAgentStore((s) => s.setWritingChapter);
  const autoGenerateActive = useAgentStore((s) => s.autoGenerateActive);
  const autoGeneratePaused = useAgentStore((s) => s.autoGeneratePaused);
  const setAutoGenerateActive = useAgentStore((s) => s.setAutoGenerateActive);
  const setAutoGeneratePaused = useAgentStore((s) => s.setAutoGeneratePaused);
  const pausedRef = useRef(false);

  // Load workspace files for chapter listing
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const refreshFiles = useCallback(() => {
    if (!novelId) return;
    novelsApi.getFiles(novelId).then(setWorkspaceFiles).catch(() => {});
  }, [novelId]);

  useEffect(() => {
    refreshFiles();
  }, [refreshFiles]);

  const chapterFiles = parseChapterFiles(workspaceFiles);

  useEffect(() => {
    if (novel) setCurrentNovel(novel);
  }, [novel, setCurrentNovel]);

  const allChaptersWritten = chapterFiles.length > 0 && chapterFiles.every((ch) => ch.hasContent);

  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showExportMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showExportMenu]);

  const handleExport = useCallback(async (format: "md" | "epub" | "txt") => {
    if (!chapterFiles || !novel) return;
    const chapterData = chapterFiles.map((ch) => ({
      number: ch.number,
      title: ch.title || `第${ch.number}章`,
      content: ch.content,
    }));
    const meta = { title: novel.title, description: novel.description, genre: novel.genre };
    if (format === "epub") {
      await exportEpub(meta, chapterData);
    } else if (format === "txt") {
      exportTxt(meta, chapterData);
    } else {
      exportMarkdown(meta, chapterData);
    }
    setShowExportMenu(false);
  }, [chapterFiles, novel]);

  const waitForStageDone = useCallback((targetNovelId: string): Promise<void> => {
    return new Promise((resolve) => {
      const poll = setInterval(async () => {
        try {
          const status = await pipelinesApi.getStatus(targetNovelId);
          const stage = status.stages.find((s) => s.name === "chapters");
          if (stage && stage.status !== "in_progress") {
            clearInterval(poll);
            refreshFiles();
            resolve();
          }
        } catch {}
      }, 3000);
    });
  }, [refreshFiles]);

  const handleAutoGenerate = useCallback(async () => {
    if (!novelId) return;
    const pending = chapterFiles.filter((ch) => !ch.hasContent);
    if (pending.length === 0) return;

    setAutoGenerateActive(true);
    setAutoGeneratePaused(false);
    pausedRef.current = false;

    // Use pipeline runStage for each pending chapter
    for (const ch of pending) {
      while (pausedRef.current) {
        await new Promise((r) => setTimeout(r, 500));
      }

      setWritingChapter(ch.path);
      try {
        await pipelinesApi.runStage(novelId, "chapters", {
          incrementalTarget: ch.path,
        });
        await waitForStageDone(novelId);
      } catch (err) {
        console.error("Auto-generate failed for chapter", ch.number, err);
      }
    }

    setWritingChapter(null);
    setAutoGenerateActive(false);
    setAutoGeneratePaused(false);
    refreshFiles();
  }, [novelId, chapterFiles, setWritingChapter, setAutoGenerateActive, setAutoGeneratePaused, waitForStageDone, refreshFiles]);

  const handlePauseResume = useCallback(() => {
    if (autoGeneratePaused) {
      pausedRef.current = false;
      setAutoGeneratePaused(false);
    } else {
      pausedRef.current = true;
      setAutoGeneratePaused(true);
    }
  }, [autoGeneratePaused, setAutoGeneratePaused]);

  const handleDelete = useCallback(async () => {
    if (!novelId) return;
    setShowDeleteConfirm(false);
    try {
      await deleteNovel.mutateAsync(novelId);
      closeFile(`overview_${novelId}`);
    } catch {
      // error handled silently
    }
  }, [novelId, deleteNovel, closeFile]);

  const handleReset = useCallback(async () => {
    if (!novelId) return;
    try {
      await resetNovel.mutateAsync(novelId);
      setShowResetConfirm(false);
      refreshFiles();
    } catch {
      // error handled silently
    }
  }, [novelId, resetNovel, refreshFiles]);

  if (!novelId) {
    return <WelcomeState onCreateNovel={() => setShowNewNovel(true)} />;
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-fg-muted">
          <Sparkles size={16} className="animate-pulse" />
          <span className="font-caption text-sm">加载中...</span>
        </div>
      </div>
    );
  }

  if (!novel) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-caption text-sm text-fg-muted">小说未找到</p>
      </div>
    );
  }

  const statusLabels: Record<string, string> = {
    creating: "创建中",
    researching: "研究中",
    writing: "写作中",
    reviewing: "审阅中",
    completed: "已完成",
  };

  const statusColors: Record<string, string> = {
    creating: "bg-warning/15 text-warning",
    researching: "bg-info/15 text-info",
    writing: "bg-accent/15 text-accent",
    reviewing: "bg-accent-rose/15 text-accent-rose",
    completed: "bg-success/15 text-success",
  };

  const tags: string[] = Array.isArray(novel.tags)
    ? novel.tags
    : typeof novel.tags === "string"
      ? JSON.parse(novel.tags)
      : [];

  return (
    <div className="h-full overflow-auto p-5">
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Editor Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white">
              <BookOpen size={18} />
            </div>
            <div>
              <h1 className="font-heading text-lg font-bold text-fg-primary">
                {novel.title}
              </h1>
              <p className="font-caption text-xs text-fg-muted">
                {novel.genre}
                {chapterFiles.length > 0 ? ` · ${chapterFiles.length} 章` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-1.5 rounded-md border border-subtle bg-surface-card px-3 py-1.5 font-body text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-muted"
              title="编辑小说信息"
            >
              <Pencil size={13} />
              编辑
            </button>
            <button
              onClick={() => setShowResetConfirm(true)}
              className="flex items-center gap-1.5 rounded-md border border-warning/30 bg-surface-card px-3 py-1.5 font-body text-xs font-medium text-warning transition-colors hover:bg-warning/10"
              title="重置小说（清空所有产出和章节）"
            >
              <RotateCcw size={13} />
              重置
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 rounded-md border border-error/30 bg-surface-card px-3 py-1.5 font-body text-xs font-medium text-error transition-colors hover:bg-error/10"
              title="删除小说"
            >
              <Trash2 size={13} />
              删除
            </button>
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setShowExportMenu((v) => !v)}
                disabled={!allChaptersWritten}
                className="flex items-center gap-1.5 rounded-md border border-subtle bg-surface-card px-3 py-1.5 font-body text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed"
                title={allChaptersWritten ? "导出小说" : "所有章节生成完毕后可导出"}
              >
                <Download size={13} />
                导出
                <ChevronDown size={12} />
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-lg border border-subtle bg-surface-card shadow-lg py-1">
                  <button
                    onClick={() => handleExport("md")}
                    className="flex w-full items-center gap-2 px-3 py-2 font-body text-xs text-fg-secondary hover:bg-surface-muted transition-colors"
                  >
                    <FileText size={13} />
                    Markdown (.md)
                  </button>
                  <button
                    onClick={() => handleExport("epub")}
                    className="flex w-full items-center gap-2 px-3 py-2 font-body text-xs text-fg-secondary hover:bg-surface-muted transition-colors"
                  >
                    <BookMarked size={13} />
                    EPUB 电子书 (.epub)
                  </button>
                  <button
                    onClick={() => handleExport("txt")}
                    className="flex w-full items-center gap-2 px-3 py-2 font-body text-xs text-fg-secondary hover:bg-surface-muted transition-colors"
                  >
                    <FileText size={13} />
                    纯文本 (.txt)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-[1fr_280px] gap-3">
          {/* Left: Description */}
          <div className="rounded-lg bg-surface-muted p-4 space-y-3">
            <p className="font-body text-sm text-fg-secondary leading-relaxed whitespace-pre-wrap">
              {novel.description || "暂无描述。"}
            </p>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-block px-2 py-0.5 rounded bg-accent-bg text-accent text-xs font-caption"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Right: Meta */}
          <div className="rounded-lg bg-surface-muted p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-caption text-xs text-fg-muted">状态</span>
              <span
                className={`inline-block px-2 py-0.5 rounded text-xs font-caption ${statusColors[novel.status] ?? "bg-surface-card text-fg-muted"}`}
              >
                {statusLabels[novel.status] ?? novel.status}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-caption text-xs text-fg-muted">
                目标章节
              </span>
              <span className="flex items-center gap-1.5 font-body text-sm text-fg-primary">
                <BookOpen size={13} className="text-fg-muted" />
                {novel.targetChapters} 章
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-caption text-xs text-fg-muted">
                创建时间
              </span>
              <span className="flex items-center gap-1.5 font-body text-sm text-fg-primary">
                <Calendar size={13} className="text-fg-muted" />
                {new Date(novel.createdAt).toLocaleDateString("zh-CN")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-caption text-xs text-fg-muted">题材</span>
              <span className="flex items-center gap-1.5 font-body text-sm text-fg-primary">
                <Tag size={13} className="text-fg-muted" />
                {novel.genre}
              </span>
            </div>
          </div>
        </div>

        {/* Meta Bar */}
        <div className="flex items-center justify-between rounded-lg bg-surface-muted px-4 py-3">
          <div className="flex items-center gap-3 text-fg-muted">
            <span className="font-caption text-xs">
              {chapterFiles.length} 章节
            </span>
            <span className="text-fg-muted/30">|</span>
            <span className="font-caption text-xs">{tags.length} 标签</span>
          </div>
          <span className="font-caption text-xs text-fg-muted">
            {novel.targetChapters} 目标
          </span>
        </div>

        {/* Workspace Tasks */}
        <div>
          <p className="font-caption text-xs font-semibold uppercase tracking-wider text-fg-muted mb-3">
            调研任务
          </p>
          <WorkspaceTasks novelId={novelId} novelTitle={novel.title} />
        </div>

        {/* Chapters Section */}
        <div>
          <p className="font-caption text-xs font-semibold uppercase tracking-wider text-fg-muted mb-3">
            章节管理
          </p>
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={handleAutoGenerate}
              disabled={autoGenerateActive || chapterFiles.length === 0 || allChaptersWritten || autoGeneratePaused}
              className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 font-body text-[11px] font-medium text-white transition-colors hover:bg-accent-deep disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {autoGenerateActive && !autoGeneratePaused ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <PenLine size={12} />
              )}
              {autoGenerateActive && !autoGeneratePaused ? "生成中..." : "自动生成"}
            </button>
            {autoGenerateActive && (
              <button
                onClick={handlePauseResume}
                className="flex items-center gap-1 rounded-md border border-subtle bg-surface-card px-2.5 py-1.5 font-body text-[11px] font-medium text-fg-secondary transition-colors hover:bg-surface-muted"
              >
                {autoGeneratePaused ? (
                  <>
                    <Play size={12} />
                    继续
                  </>
                ) : (
                  <>
                    <Pause size={12} />
                    暂停
                  </>
                )}
              </button>
            )}
            {allChaptersWritten && (
              <span className="flex items-center gap-1 font-caption text-xs text-success">
                <CheckCircle2 size={13} />
                全部完成
              </span>
            )}
          </div>

          {/* Chapter List */}
          {chapterFiles.length > 0 ? (
            <div className="space-y-2">
              {chapterFiles.map((ch) => (
                <FileChapterCard
                  key={ch.path}
                  chapter={ch}
                  novelId={novelId}
                  novelTitle={novel.title}
                  onRefresh={refreshFiles}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-subtle p-6 text-center">
              <BookOpen size={20} className="mx-auto text-fg-muted mb-2" />
              <p className="font-caption text-xs text-fg-muted">
                完成 Pipeline 的"故事设计"阶段后，章节大纲将自动生成
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Novel Modal */}
      {showEditModal && novel && (
        <EditNovelModal novel={novel} onClose={() => setShowEditModal(false)} />
      )}

      {/* Reset Confirmation */}
      {showResetConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowResetConfirm(false)}
        >
          <div
            className="w-[400px] max-w-[95vw] rounded-xl border border-subtle bg-surface-primary p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-heading text-base font-bold text-fg-primary mb-2">
              确认重置
            </h3>
            <p className="font-body text-sm text-fg-secondary mb-5">
              确定要重置小说「{novel.title}」吗？所有 Agent 产出、章节内容和聊天记录将被清空，小说将恢复到新建状态。小说基本信息（标题、类型、简介）会保留。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="rounded-md border border-subtle bg-surface-card px-4 py-2 font-body text-sm text-fg-secondary hover:bg-surface-muted transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleReset}
                disabled={resetNovel.isPending}
                className="flex items-center gap-1.5 rounded-md bg-warning px-4 py-2 font-body text-sm font-medium text-white transition-colors hover:bg-warning/90 disabled:opacity-50"
              >
                {resetNovel.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RotateCcw size={14} />
                )}
                确认重置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="w-[400px] max-w-[95vw] rounded-xl border border-subtle bg-surface-primary p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-heading text-base font-bold text-fg-primary mb-2">
              确认删除
            </h3>
            <p className="font-body text-sm text-fg-secondary mb-5">
              确定要删除小说「{novel.title}」吗？此操作不可撤销，所有章节和文档将被永久删除。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-md border border-subtle bg-surface-card px-4 py-2 font-body text-sm text-fg-secondary hover:bg-surface-muted transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteNovel.isPending}
                className="flex items-center gap-1.5 rounded-md bg-error px-4 py-2 font-body text-sm font-medium text-white transition-colors hover:bg-error/90 disabled:opacity-50"
              >
                {deleteNovel.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FileChapterCard({
  chapter,
  novelId,
  novelTitle,
  onRefresh,
}: {
  chapter: ChapterFileInfo;
  novelId: string;
  novelTitle: string;
  onRefresh: () => void;
}) {
  const writingChapterId = useAgentStore((s) => s.writingChapterId);
  const setWritingChapter = useAgentStore((s) => s.setWritingChapter);
  const openFile = useEditorStore((s) => s.openFile);
  const [showRerunModal, setShowRerunModal] = useState(false);
  const isThisWriting = writingChapterId === chapter.path;
  const isAnyWriting = writingChapterId !== null;

  const handleGenerate = useCallback(async (directive?: string) => {
    setWritingChapter(chapter.path);
    try {
      await pipelinesApi.runStage(novelId, "chapters", {
        incrementalTarget: chapter.path,
        userDirective: directive || undefined,
      });
      // Poll until done
      const poll = setInterval(async () => {
        try {
          const status = await pipelinesApi.getStatus(novelId);
          const stage = status.stages.find((s) => s.name === "chapters");
          if (stage && stage.status !== "in_progress") {
            clearInterval(poll);
            setWritingChapter(null);
            onRefresh();
          }
        } catch {}
      }, 3000);
    } catch (err) {
      console.error("Write pipeline failed:", err);
      setWritingChapter(null);
    }
  }, [chapter.path, novelId, setWritingChapter, onRefresh]);

  const handleOpen = useCallback(() => {
    openFile({
      id: `${novelId}:${chapter.path}`,
      path: chapter.path,
      type: "workspace",
      label: `第${chapter.number}章${chapter.title ? ` ${chapter.title}` : ""}`,
      novelId,
    });
  }, [openFile, novelId, chapter]);

  return (
    <>
      <div
        onClick={handleOpen}
        className="group rounded-lg border border-subtle bg-surface-card p-3.5 text-left transition-colors hover:border-accent/40 cursor-pointer"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent mt-0.5">
            <BookOpen size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-body text-sm font-medium text-fg-primary">
              第{chapter.number}章 {chapter.title}
            </p>
            <div className="flex items-center gap-3 mt-2">
              {chapter.hasContent ? (
                <>
                  <span className="font-caption text-[11px] text-fg-muted">
                    {chapter.wordCount} 字
                  </span>
                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-caption bg-success/15 text-success">
                    已完成
                  </span>
                </>
              ) : (
                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-caption bg-warning/15 text-warning">
                  待生成
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {chapter.hasContent && (
              <button
                onClick={(e) => { e.stopPropagation(); handleOpen(); }}
                disabled={isAnyWriting}
                className="flex items-center gap-1 rounded-md border border-subtle px-2.5 py-1.5 font-body text-[11px] text-fg-secondary transition-colors hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed"
                title="查看章节"
              >
                <Eye size={12} />
                查看
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (chapter.hasContent) {
                  setShowRerunModal(true);
                } else {
                  handleGenerate();
                }
              }}
              disabled={isAnyWriting}
              className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 font-body text-[11px] font-medium text-white transition-colors hover:bg-accent-deep disabled:opacity-50 disabled:cursor-not-allowed"
              title={chapter.hasContent ? "重新生成章节" : "生成章节内容"}
            >
              {isThisWriting ? (
                <Loader2 size={12} className="animate-spin" />
              ) : chapter.hasContent ? (
                <RefreshCw size={12} />
              ) : (
                <PenLine size={12} />
              )}
              {isThisWriting ? "生成中..." : chapter.hasContent ? "重新生成" : "生成章节"}
            </button>
          </div>
        </div>
      </div>

      {showRerunModal && (
        <ChapterRerunModal
          chapterLabel={`第${chapter.number}章 ${chapter.title}`}
          onConfirm={(directive) => {
            setShowRerunModal(false);
            handleGenerate(directive);
          }}
          onCancel={() => setShowRerunModal(false)}
        />
      )}
    </>
  );
}

function ChapterRerunModal({
  chapterLabel,
  onConfirm,
  onCancel,
}: {
  chapterLabel: string;
  onConfirm: (directive: string) => void;
  onCancel: () => void;
}) {
  const [directive, setDirective] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-[440px] max-w-[95vw] rounded-xl border border-subtle bg-surface-primary p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-heading text-base font-bold text-fg-primary mb-1">
          重新生成「{chapterLabel}」
        </h3>
        <p className="font-body text-sm text-fg-secondary mb-4">
          输入自定义指令可以引导 agent 按照你的要求重新生成。留空则直接重新生成。
        </p>
        <textarea
          value={directive}
          onChange={(e) => setDirective(e.target.value)}
          placeholder="例如：请增加更多的环境描写和心理活动..."
          rows={3}
          className="w-full rounded-lg border border-subtle bg-surface-primary px-3 py-2 font-body text-sm text-fg-primary placeholder:text-fg-muted/50 focus:border-accent focus:outline-none resize-none"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="rounded-md border border-subtle bg-surface-card px-4 py-2 font-body text-sm text-fg-secondary hover:bg-surface-muted transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(directive)}
            className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 font-body text-sm font-medium text-white transition-colors hover:bg-accent-deep"
          >
            <RefreshCw size={14} />
            重新生成
          </button>
        </div>
      </div>
    </div>
  );
}

function WelcomeState({ onCreateNovel }: { onCreateNovel: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-accent-bg text-accent">
        <BookOpen size={28} />
      </div>
      <div className="text-center">
        <h1 className="font-heading text-xl font-bold text-fg-primary">
          欢迎来到 Fictia
        </h1>
        <p className="mt-1 font-body text-sm text-fg-secondary">
          自由发挥你的创意，开始AI智能写作之旅
        </p>
      </div>
      <button
        onClick={onCreateNovel}
        className="mt-2 flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 font-body text-sm font-medium text-white transition-colors hover:bg-accent-deep"
      >
        <Plus size={16} />
        创建新小说
      </button>
    </div>
  );
}
