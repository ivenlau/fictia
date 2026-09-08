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
  FastForward,
} from "lucide-react";
import { useNovelStore } from "@/stores/novelStore";
import { useUIStore } from "@/stores/uiStore";
import { useAgentStore } from "@/stores/agentStore";
import { useNovel, useDeleteNovel, useResetNovel } from "@/hooks/useNovel";
import { useEditorStore } from "@/stores/editorStore";
import { novelsApi } from "@/api/novels";
import { pipelinesApi } from "@/api/pipelines";
import { EditNovelModal } from "@/features/novel/EditNovelModal";
import { AutopilotDialog } from "@/features/chapter/AutopilotDialog";
import { runAutopilot } from "@/api/writing-loop";
import { exportMarkdown, exportEpub, exportTxt } from "@/utils/export";
import { WorkspaceTasks } from "./WorkspaceTasks";
import { countWords } from "@/lib/markdown";
import { Modal, ModalShell, ModalButton } from "@/components/ui/Modal";
import { agentColor } from "@/lib/agentColors";
import type { WorkspaceFile } from "@fictia/shared";
import { STAGE_ORDER, STAGE_LABELS } from "@fictia/shared";

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
  const [resetFromStage, setResetFromStage] = useState<string>("all");
  const [showAutopilot, setShowAutopilot] = useState(false);
  const [autopilotRunning, setAutopilotRunning] = useState(false);

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

  const allChaptersWritten =
    chapterFiles.length >= (novel?.targetChapters ?? Infinity) &&
    chapterFiles.length > 0 &&
    chapterFiles.every((ch) => ch.hasContent);

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

  const handleStartAutopilot = useCallback(
    async (options: { startChapter?: number; endChapter?: number }) => {
      setShowAutopilot(false);
      setAutopilotRunning(true);
      try {
        await runAutopilot(novelId!, options, () => {});
        refreshFiles();
      } catch (err) {
        console.error("Autopilot failed:", err);
      } finally {
        setAutopilotRunning(false);
      }
    },
    [novelId, refreshFiles],
  );

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
      await resetNovel.mutateAsync({
        id: novelId,
        fromStage: resetFromStage === "all" ? undefined : resetFromStage,
      });
      setShowResetConfirm(false);
      refreshFiles();
    } catch {
      // error handled silently
    }
  }, [novelId, resetNovel, refreshFiles, resetFromStage]);

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
    creating: "border-warning/40 bg-warning/12 text-warning",
    researching: "border-cyan/40 bg-cyan/12 text-cyan",
    writing: "border-accent/40 bg-accent/12 text-accent",
    reviewing: "border-rose/40 bg-rose/12 text-rose",
    completed: "border-emerald/40 bg-emerald/12 text-emerald",
  };

  const tags: string[] = Array.isArray(novel.tags)
    ? novel.tags
    : typeof novel.tags === "string"
      ? JSON.parse(novel.tags)
      : [];

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-5xl mx-auto space-y-5 card-enter">
        {/* Hero Card · pen 预览风格 */}
        <div className="gradient-hero relative overflow-hidden rounded-2xl border border-subtle p-6 shadow-card">
          <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-accent/10 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {novel.genre && (
                  <span className="rounded-full border border-violet/35 bg-violet/12 px-2.5 py-0.5 text-[11px] font-semibold text-violet">
                    {novel.genre}
                  </span>
                )}
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                    statusColors[novel.status] ?? "border-subtle text-fg-muted"
                  }`}
                >
                  {statusLabels[novel.status] ?? novel.status}
                </span>
                <span className="rounded-full border border-cyan/35 bg-cyan/12 px-2.5 py-0.5 text-[11px] font-semibold text-cyan">
                  {chapterFiles.length} / {novel.targetChapters} 章
                </span>
              </div>
              <h1 className="font-display text-[28px] font-bold leading-tight text-fg-primary">
                {novel.title}
              </h1>
              <p className="max-w-[560px] font-body text-[13px] leading-relaxed text-fg-secondary">
                {novel.description || "暂无描述。点击「编辑」补充作品简介。"}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                onClick={() => setShowEditModal(true)}
                className="flex items-center gap-1.5 rounded-md border border-subtle bg-surface-card px-3 py-1.5 font-body text-xs font-medium text-fg-secondary transition-all hover-lift hover:border-strong hover:bg-surface-elevated"
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
                  className="btn-press flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-body text-xs font-semibold text-accent-ink transition-all hover:bg-accent-light disabled:opacity-40 disabled:cursor-not-allowed"
                  title={allChaptersWritten ? "导出小说" : "所有章节生成完毕后可导出"}
                >
                  <Download size={13} />
                  导出
                  <ChevronDown size={12} />
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-48 animate-scale-in rounded-lg border border-subtle bg-surface-elevated py-1 shadow-panel">
                    <button
                      onClick={() => handleExport("md")}
                      className="flex w-full items-center gap-2 px-3 py-2 font-body text-xs text-fg-secondary transition-colors hover:bg-surface-card hover:text-fg-primary"
                    >
                      <FileText size={13} />
                      Markdown (.md)
                    </button>
                    <button
                      onClick={() => handleExport("epub")}
                      className="flex w-full items-center gap-2 px-3 py-2 font-body text-xs text-fg-secondary transition-colors hover:bg-surface-card hover:text-fg-primary"
                    >
                      <BookMarked size={13} />
                      EPUB 电子书 (.epub)
                    </button>
                    <button
                      onClick={() => handleExport("txt")}
                      className="flex w-full items-center gap-2 px-3 py-2 font-body text-xs text-fg-secondary transition-colors hover:bg-surface-card hover:text-fg-primary"
                    >
                      <FileText size={13} />
                      纯文本 (.txt)
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Meta strip */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-subtle bg-surface-card px-4 py-3">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-block rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[11px] font-semibold text-accent"
            >
              {tag}
            </span>
          ))}
          <div className="ml-auto flex items-center gap-4 font-caption text-[11px] text-fg-muted">
            <span className="flex items-center gap-1">
              <BookOpen size={12} className="text-accent" />
              {chapterFiles.length} 章节
            </span>
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              {new Date(novel.createdAt).toLocaleDateString("zh-CN")}
            </span>
            <span className="flex items-center gap-1">
              <Tag size={12} />
              {novel.targetChapters} 目标
            </span>
          </div>
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
              onClick={() => setShowAutopilot(true)}
              disabled={allChaptersWritten || autopilotRunning}
              className="btn-press flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 font-body text-[11px] font-semibold text-accent-ink transition-all hover:bg-accent-light disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {autopilotRunning ? <Loader2 size={12} className="animate-spin" /> : <FastForward size={12} />}
              {autopilotRunning ? "自动驾驶..." : "自动驾驶"}
            </button>
            {allChaptersWritten && (
              <span className="flex items-center gap-1 font-caption text-xs text-accent">
                <CheckCircle2 size={13} />
                全部完成
              </span>
            )}
          </div>

          {/* Chapter List */}
          {chapterFiles.length > 0 ? (
            <div className="space-y-2">
              {chapterFiles.map((ch, idx) => (
                <div
                  key={ch.path}
                  className="stagger-child"
                  style={{ ["--stagger-i" as string]: Math.min(idx, 10) }}
                >
                  <FileChapterCard
                    chapter={ch}
                    novelId={novelId}
                    novelTitle={novel.title}
                    disabled={autopilotRunning}
                    onRefresh={refreshFiles}
                  />
                </div>
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

      {/* Autopilot Dialog */}
      {showAutopilot && novel && (
        <AutopilotDialog
          startChapter={chapterFiles.length + 1}
          maxChapter={novel?.targetChapters ?? 20}
          onClose={() => setShowAutopilot(false)}
          onConfirm={handleStartAutopilot}
        />
      )}

      {/* Reset Confirmation */}
      <Modal open={showResetConfirm} onClose={() => setShowResetConfirm(false)} maxWidthClass="w-full max-w-[400px]">
        <ModalShell
          title="重置小说"
          description="选择重置起点：将从该阶段起清空产出（含后续所有阶段），前面已确认的阶段保留。"
          footer={
            <>
              <ModalButton onClick={() => setShowResetConfirm(false)}>取消</ModalButton>
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
            className="w-full rounded-md border border-subtle bg-surface-card px-3 py-2 font-body text-sm text-fg-primary mb-3 focus:outline-none focus:border-accent"
          >
            <option value="all">重置全部（恢复新建状态）</option>
            {STAGE_ORDER.map((s) => (
              <option key={s} value={s}>
                从「{(STAGE_LABELS as Record<string, string>)[s]}」开始重置
              </option>
            ))}
          </select>
          <p className="font-body text-xs text-fg-muted mb-5">
            {resetFromStage === "all"
              ? "清空所有 Agent 产出、章节、聊天记录，恢复到新建状态（保留基本信息）。"
              : `将删除「${(STAGE_LABELS as Record<string, string>)[resetFromStage]}」及其后所有阶段的产出；前面阶段与聊天记录保留。`}
          </p>
        </ModalShell>
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} maxWidthClass="w-full max-w-[400px]">
        <ModalShell
          title="确认删除"
          description={`确定要删除小说「${novel.title}」吗？此操作不可撤销，所有章节和文档将被永久删除。`}
          footer={
            <>
              <ModalButton onClick={() => setShowDeleteConfirm(false)}>取消</ModalButton>
              <ModalButton tone="danger" onClick={handleDelete} disabled={deleteNovel.isPending}>
                {deleteNovel.isPending ? "删除中..." : "确认删除"}
              </ModalButton>
            </>
          }
        />
      </Modal>
    </div>
  );
}

function FileChapterCard({
  chapter,
  novelId,
  novelTitle,
  onRefresh,
  disabled,
}: {
  chapter: ChapterFileInfo;
  novelId: string;
  novelTitle: string;
  onRefresh: () => void;
  disabled?: boolean;
}) {
  const writingChapterId = useAgentStore((s) => s.writingChapterId);
  const setWritingChapter = useAgentStore((s) => s.setWritingChapter);
  const openFile = useEditorStore((s) => s.openFile);
  const [showRerunModal, setShowRerunModal] = useState(false);
  const [justFinished, setJustFinished] = useState(false);
  const isThisWriting = writingChapterId === chapter.path;
  const isAnyWriting = writingChapterId !== null || !!disabled;
  const prevWriting = useRef(isThisWriting);

  useEffect(() => {
    if (prevWriting.current && !isThisWriting && chapter.hasContent) {
      setJustFinished(true);
      window.dispatchEvent(new CustomEvent("fictia:success"));
      const t = window.setTimeout(() => setJustFinished(false), 600);
      return () => window.clearTimeout(t);
    }
    prevWriting.current = isThisWriting;
  }, [isThisWriting, chapter.hasContent]);

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
        className={`group relative overflow-hidden rounded-lg border bg-surface-card p-3.5 text-left transition-colors cursor-pointer ${
          isThisWriting
            ? "border-accent/45 shadow-glow"
            : "border-subtle hover:border-accent/40"
        }`}
      >
        {isThisWriting && (
          <div className="ink-progress ink-progress-indeterminate absolute inset-x-0 bottom-0" aria-hidden>
            <i />
          </div>
        )}
        {justFinished && (
          <span
            className="pointer-events-none absolute inset-0 rounded-lg shadow-[0_0_0_1px_rgb(var(--c-success)/0.45),0_0_18px_rgb(var(--c-success)/0.2)]"
            aria-hidden
          />
        )}
        <div className="flex items-start gap-3">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md mt-0.5 ${
              isThisWriting
                ? "bg-accent-bg text-accent"
                : chapter.hasContent
                  ? `${agentColor("chapter-writer").bg} ${agentColor("chapter-writer").text}`
                  : "bg-surface-muted text-fg-muted"
            }`}
          >
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
                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-caption bg-accent-bg text-accent">
                    已完成
                  </span>
                </>
              ) : (
                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-caption bg-warning/15 text-warning">
                  {isThisWriting ? "落墨中" : "待生成"}
                </span>
              )}
              {isThisWriting && (
                <span className="font-caption text-[10px] text-accent animate-pulse-soft">
                  Agent 正在书写…
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {chapter.hasContent && (
              <button
                onClick={(e) => { e.stopPropagation(); handleOpen(); }}
                disabled={isAnyWriting}
                className="btn-press flex items-center gap-1 rounded-md border border-subtle px-2.5 py-1.5 font-body text-[11px] text-fg-secondary transition-colors hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="btn-press flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 font-body text-[11px] font-medium text-accent-ink transition-colors hover:bg-accent-light disabled:opacity-50 disabled:cursor-not-allowed"
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
  const [open, setOpen] = useState(true);

  const close = () => {
    setOpen(false);
    window.setTimeout(onCancel, 140);
  };

  return (
    <Modal open={open} onClose={close} maxWidthClass="w-full max-w-[440px]">
      <ModalShell
        title={`重新生成「${chapterLabel}」`}
        description="输入自定义指令可以引导 agent 按照你的要求重新生成。留空则直接重新生成。"
        footer={
          <>
            <ModalButton onClick={close}>取消</ModalButton>
            <ModalButton tone="primary" onClick={() => onConfirm(directive)}>
              重新生成
            </ModalButton>
          </>
        }
      >
        <textarea
          value={directive}
          onChange={(e) => setDirective(e.target.value)}
          placeholder="例如：请增加更多的环境描写和心理活动..."
          rows={3}
          className="w-full rounded-lg border border-subtle bg-surface-primary px-3 py-2 font-body text-sm text-fg-primary placeholder:text-fg-muted/50 focus:border-accent focus:outline-none resize-none mb-2"
        />
      </ModalShell>
    </Modal>
  );
}

function WelcomeState({ onCreateNovel }: { onCreateNovel: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-accent-bg text-accent animate-float-soft">
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
        className="btn-press mt-2 flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 font-body text-sm font-medium text-accent-ink transition-colors hover:bg-accent-light"
      >
        <Plus size={16} />
        创建新小说
      </button>
    </div>
  );
}
