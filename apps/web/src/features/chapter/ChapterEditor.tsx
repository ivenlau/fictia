import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Save, Loader2, PenLine, RefreshCw, Eye, Edit3, Wand2, AlertTriangle, AlertCircle, Info, ChevronUp, ChevronDown } from "lucide-react";
import { useChapter, useChapterFeedback } from "@/hooks/useNovel";
import { useTriggerChapterAgent } from "@/hooks/useAgent";
import { useAgentStore } from "@/stores/agentStore";
import { useEditorStore } from "@/stores/editorStore";
import { chaptersApi } from "@/api/chapters";
import { novelsApi } from "@/api/novels";
import { pipelinesApi } from "@/api/pipelines";
import { agentsApi } from "@/api/agents";
import { feedbackApi } from "@/api/feedback";
import { ChapterReading } from "./ChapterReading";
import { ReviewActions } from "./ReviewActions";
import { ProblemsPanel } from "./ProblemsPanel";
import { RewriteDialog } from "./RewriteDialog";
import { countWords } from "@/lib/markdown";
import type { WorkspaceFile } from "@fictia/shared";

// File-based review suggestion types
interface ReviewSuggestion {
  id: number;
  severity: "serious" | "general" | "detail";
  location: string;
  type: string;
  description: string;
  suggestion: string;
  status: "pending" | "applied" | "ignored";
}

function sanitizeReviewJson(raw: string): string {
  let s = raw
    .split("“").join("'")
    .split("”").join("'")
    .split("‘").join("'")
    .split("’").join("'");
  // Fix unescaped double quotes inside JSON string values
  const chars = [...s];
  let inStr = false;
  let escaped = false;
  for (let i = 0; i < chars.length; i++) {
    if (escaped) { escaped = false; continue; }
    if (chars[i] === '\\') { escaped = true; continue; }
    if (chars[i] === '"') {
      if (!inStr) { inStr = true; }
      else {
        const rest = s.slice(i + 1).trimStart();
        if (rest[0] === ':' || rest[0] === ',' || rest[0] === '}' || rest[0] === ']' || rest === '') {
          inStr = false;
        } else {
          chars[i] = '\\"';
        }
      }
    }
  }
  return chars.join('');
}

function parseReviewSuggestions(content: string): ReviewSuggestion[] {
  const match = content.match(/<!--\s*REVIEW_DATA\s*([\s\S]*?)\s*REVIEW_DATA\s*-->/);
  if (!match) return [];
  try {
    const data = JSON.parse(sanitizeReviewJson(match[1]));
    return data.suggestions ?? [];
  } catch {
    return [];
  }
}

function updateSuggestionStatus(content: string, id: number, status: string): string {
  const match = content.match(/<!--\s*REVIEW_DATA\s*([\s\S]*?)\s*REVIEW_DATA\s*-->/);
  if (!match) return content;
  try {
    const data = JSON.parse(sanitizeReviewJson(match[1]));
    const idx = data.suggestions.findIndex((s: any) => s.id === id);
    if (idx >= 0) data.suggestions[idx].status = status;
    const newJson = JSON.stringify(data, null, 2);
    return content.replace(
      /<!--\s*REVIEW_DATA\s*[\s\S]*?\s*REVIEW_DATA\s*-->/,
      `<!-- REVIEW_DATA\n${newJson}\nREVIEW_DATA -->`,
    );
  } catch {
    return content;
  }
}

interface ChapterEditorProps {
  chapterId?: string;
  filePath?: string;
  novelId?: string;
}

export function ChapterEditor({ chapterId: propChapterId, filePath, novelId: propNovelId }: ChapterEditorProps = {}) {
  const params = useParams<{ novelId: string; chapterId: string }>();
  const openFiles = useEditorStore((s) => s.openFiles);
  const activeFileId = useEditorStore((s) => s.activeFileId);

  const chapterId = propChapterId ?? params.chapterId;
  const isFileMode = !!filePath;

  // Get novelId from various sources
  const currentTab = openFiles.find((f) => f.id === activeFileId);
  const novelId = propNovelId ?? currentTab?.novelId ?? params.novelId ?? window.location.pathname.match(/\/novel\/([^/]+)/)?.[1];

  const queryClient = useQueryClient();

  // DB mode data
  const { data: chapter, isLoading: chapterLoading } = useChapter(isFileMode ? undefined : chapterId);
  const { data: feedback = [], refetch: refetchFeedback } =
    useChapterFeedback(isFileMode ? undefined : chapterId);
  const triggerAgent = useTriggerChapterAgent(isFileMode ? "" : (chapterId ?? ""));

  // File mode state
  const [fileContent, setFileContent] = useState<string>("");
  const [fileLoading, setFileLoading] = useState(false);

  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isRevising, setIsRevising] = useState(false);
  const [viewMode, setViewMode] = useState<"preview" | "edit">("preview");
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [showRewriteDialog, setShowRewriteDialog] = useState(false);
  const [selectionPos, setSelectionPos] = useState<{ x: number; y: number } | null>(null);
  const [reviewSuggestions, setReviewSuggestions] = useState<ReviewSuggestion[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const writingChapterId = useAgentStore((s) => s.writingChapterId);
  const setWritingChapter = useAgentStore((s) => s.setWritingChapter);
  const isThisWriting = isFileMode
    ? writingChapterId === filePath
    : writingChapterId === chapterId;
  const isAnyWriting = writingChapterId !== null;

  // File mode: load content from workspace files
  useEffect(() => {
    if (!isFileMode || !novelId || !filePath) return;
    setFileLoading(true);
    novelsApi.getFiles(novelId).then((files: WorkspaceFile[]) => {
      const file = files.find((f) => f.path === filePath);
      const c = file?.content ?? "";
      setFileContent(c);
      setContent(c);
      setHasChanges(false);
      setFileLoading(false);
    }).catch(() => {
      setFileContent("");
      setContent("");
      setFileLoading(false);
    });
  }, [isFileMode, novelId, filePath]);

  // File mode: load existing review suggestions on mount
  useEffect(() => {
    if (!isFileMode || !novelId || !filePath) return;
    const chNum = filePath.match(/ch(\d+)/)?.[1];
    if (!chNum) return;
    const reviewPath = `reviews/ch${chNum}-review.md`;
    novelsApi.getFiles(novelId).then((files: WorkspaceFile[]) => {
      const reviewFile = files.find((f) => f.path === reviewPath);
      if (reviewFile?.content) {
        const suggestions = parseReviewSuggestions(reviewFile.content);
        if (suggestions.length > 0) setReviewSuggestions(suggestions);
      }
    }).catch(() => {});
  }, [isFileMode, novelId, filePath]);

  // DB mode: sync content from chapter
  useEffect(() => {
    if (isFileMode) return;
    if (chapter) {
      setContent(chapter.content ?? "");
      setHasChanges(false);
    }
  }, [isFileMode, chapter]);

  // Sync writing state from backend on mount
  useEffect(() => {
    if (!novelId) return;
    const targetId = isFileMode ? filePath : chapterId;
    if (!targetId) return;
    const checkRunning = async () => {
      try {
        const outputs = await fetch(`/api/novels/${novelId}/agent-outputs`).then(r => r.json());
        const runningWriter = outputs.find(
          (o: any) => o.agentType === "chapter-writer" && (o.status === "running" || o.status === "pending"),
        );
        if (runningWriter) {
          setWritingChapter(isFileMode ? filePath : runningWriter.chapterId);
          startPolling(targetId, novelId, runningWriter.id);
        }
      } catch {}
    };
    checkRunning();
  }, [novelId, isFileMode, filePath, chapterId]);

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setContent(e.target.value);
      setHasChanges(true);
    },
    [],
  );

  const handleTextSelection = useCallback(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (text && text.length > 0 && contentRef.current) {
      const range = sel!.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelectedText(text);
      setSelectionPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
    } else {
      setSelectedText(null);
      setSelectionPos(null);
    }
  }, []);

  const handleOpenRewrite = useCallback((text?: string) => {
    setSelectedText(text ?? null);
    setShowRewriteDialog(true);
    setSelectionPos(null);
  }, []);

  const handleRewritten = useCallback((updatedContent: string) => {
    setContent(updatedContent);
    setFileContent(updatedContent);
    setHasChanges(false);
    if (isFileMode && novelId) {
      queryClient.invalidateQueries({ queryKey: ["workspace-files", novelId] });
    } else if (chapterId) {
      queryClient.invalidateQueries({ queryKey: ["chapter", chapterId] });
    }
  }, [isFileMode, novelId, chapterId, queryClient]);

  const handleSave = useCallback(async () => {
    if (!hasChanges) return;
    setIsSaving(true);
    try {
      if (isFileMode && novelId && filePath) {
        await novelsApi.updateFile(novelId, filePath, content);
        setFileContent(content);
      } else if (chapterId) {
        await chaptersApi.update(chapterId, { content });
      }
      setHasChanges(false);
    } catch {
      // error handled silently
    } finally {
      setIsSaving(false);
    }
  }, [isFileMode, novelId, filePath, chapterId, content, hasChanges]);

  const handleTriggerReview = useCallback(
    async (type: string): Promise<string | undefined> => {
      if (isFileMode && novelId && filePath) {
        setReviewLoading(true);
        setReviewSuggestions([]);
        const agentStage = type === "consistency" ? "consistency" : "editor";
        try {
          await pipelinesApi.runStage(novelId, agentStage, {
            incrementalTarget: filePath,
          });
          // runStage blocks until agent completes — load review file directly
          const chNum = filePath.match(/ch(\d+)/)?.[1] ?? "01";
          const reviewPath = `reviews/ch${chNum}-review.md`;
          const files = await novelsApi.getFiles(novelId);
          const reviewFile = files.find((f: WorkspaceFile) => f.path === reviewPath);
          if (reviewFile?.content) {
            const suggestions = parseReviewSuggestions(reviewFile.content);
            setReviewSuggestions(suggestions);
          }
        } catch (err: any) {
          console.error("File review failed:", err);
        } finally {
          setReviewLoading(false);
        }
        return undefined;
      }
      // DB mode
      const agentType = type === "consistency" ? "consistency-checker" : "editor";
      return new Promise((resolve) => {
        triggerAgent.mutate(
          { agentType },
          {
            onSuccess: (data: any) => {
              refetchFeedback();
              resolve(data?.outputId);
            },
            onError: () => resolve(undefined),
          },
        );
      });
    },
    [isFileMode, novelId, filePath, triggerAgent, refetchFeedback],
  );

  const handleAdopt = useCallback(async (feedbackId: string) => {
    await feedbackApi.adopt(feedbackId);
    refetchFeedback();
  }, [refetchFeedback]);

  const handleIgnore = useCallback(async (feedbackId: string) => {
    await feedbackApi.ignore(feedbackId);
    refetchFeedback();
  }, [refetchFeedback]);

  const handleApplySuggestion = useCallback(async (suggestion: ReviewSuggestion) => {
    if (!novelId || !filePath) return;
    try {
      await agentsApi.fileRewrite(novelId, {
        filePath,
        instruction: suggestion.suggestion,
      });
      // Update suggestion status in the review file
      const chNum = filePath.match(/ch(\d+)/)?.[1] ?? "01";
      const reviewPath = `reviews/ch${chNum}-review.md`;
      const files = await novelsApi.getFiles(novelId);
      const reviewFile = files.find((f: WorkspaceFile) => f.path === reviewPath);
      if (reviewFile?.content) {
        const updated = updateSuggestionStatus(reviewFile.content, suggestion.id, "applied");
        await novelsApi.updateFile(novelId, reviewPath, updated);
        const newSuggestions = parseReviewSuggestions(updated);
        setReviewSuggestions(newSuggestions);
      }
      // Refresh chapter content
      const refreshedFiles = await novelsApi.getFiles(novelId);
      const chapterFile = refreshedFiles.find((f: WorkspaceFile) => f.path === filePath);
      if (chapterFile?.content) {
        setContent(chapterFile.content);
        setFileContent(chapterFile.content);
        setHasChanges(false);
      }
    } catch (err) {
      console.error("Apply suggestion failed:", err);
    }
  }, [novelId, filePath]);

  const handleIgnoreSuggestion = useCallback(async (suggestion: ReviewSuggestion) => {
    if (!novelId || !filePath) return;
    try {
      const newStatus = suggestion.status === "ignored" ? "pending" : "ignored";
      const chNum = filePath.match(/ch(\d+)/)?.[1] ?? "01";
      const reviewPath = `reviews/ch${chNum}-review.md`;
      const files = await novelsApi.getFiles(novelId);
      const reviewFile = files.find((f: WorkspaceFile) => f.path === reviewPath);
      if (reviewFile?.content) {
        const updated = updateSuggestionStatus(reviewFile.content, suggestion.id, newStatus);
        await novelsApi.updateFile(novelId, reviewPath, updated);
        const newSuggestions = parseReviewSuggestions(updated);
        setReviewSuggestions(newSuggestions);
      }
    } catch (err) {
      console.error("Ignore suggestion failed:", err);
    }
  }, [novelId, filePath]);

  const startPolling = useCallback((targetId: string, targetNovelId: string, outputId: string) => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/novels/${targetNovelId}/agent-outputs`);
        const outputs = await res.json();
        const writer = outputs.find((o: any) => o.id === outputId);
        if (writer && writer.status !== "running" && writer.status !== "pending") {
          clearInterval(poll);
          setWritingChapter(null);
          if (isFileMode) {
            // Reload file content
            novelsApi.getFiles(targetNovelId).then((files: WorkspaceFile[]) => {
              const file = files.find((f) => f.path === filePath);
              if (file?.content) {
                setFileContent(file.content);
                setContent(file.content);
                setHasChanges(false);
              }
            });
          } else {
            queryClient.invalidateQueries({ queryKey: ["chapters", targetNovelId] });
            queryClient.invalidateQueries({ queryKey: ["chapter", targetId] });
          }
          queryClient.invalidateQueries({ queryKey: ["agent-outputs", targetNovelId] });
          if (!isFileMode) {
            queryClient.invalidateQueries({ queryKey: ["feedback", targetId] });
          }
        }
      } catch {}
    }, 3000);
  }, [queryClient, setWritingChapter, isFileMode, filePath]);

  const handleWrite = useCallback(async () => {
    const targetId = isFileMode ? filePath : chapterId;
    if (!targetId || !novelId) return;
    setWritingChapter(targetId);
    try {
      await pipelinesApi.runStage(novelId, "chapters", {
        incrementalTarget: filePath ?? chapterId,
      });
      startPolling(targetId, novelId, targetId);
    } catch (err) {
      console.error("Write pipeline failed:", err);
      setWritingChapter(null);
    }
  }, [isFileMode, filePath, chapterId, novelId, setWritingChapter, startPolling]);

  const handleRevise = useCallback(async () => {
    const targetId = isFileMode ? filePath : chapterId;
    if (!targetId || !novelId) return;
    setIsRevising(true);
    setWritingChapter(targetId);
    try {
      await pipelinesApi.runStage(novelId, "editor", {
        incrementalTarget: filePath ?? chapterId,
        isRedo: true,
      });
      startPolling(targetId, novelId, targetId);
    } catch (err) {
      console.error("Revise pipeline failed:", err);
      setWritingChapter(null);
    } finally {
      setIsRevising(false);
    }
  }, [isFileMode, filePath, chapterId, novelId, setWritingChapter, startPolling]);

  // Loading state
  if ((!isFileMode && chapterLoading) || (isFileMode && fileLoading)) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-fg-muted">
          <Loader2 size={16} className="animate-spin" />
          <span className="font-caption text-sm">加载章节...</span>
        </div>
      </div>
    );
  }

  // Not found state
  if (!isFileMode && !chapter) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-caption text-sm text-fg-muted">章节未找到</p>
      </div>
    );
  }

  // Extract chapter info based on mode
  const chapterNumber = isFileMode
    ? parseInt(filePath!.match(/ch(\d+)\.md/)?.[1] ?? "0")
    : chapter!.number;
  const chapterTitle = isFileMode
    ? (() => {
        const m = fileContent.match(/^#\s+(.+)$/m);
        return m ? m[1].trim() : "";
      })()
    : chapter!.title;
  const wordCount = isFileMode
    ? countWords(content)
    : (chapter!.wordCount ?? 0);
  const version = isFileMode ? 1 : (chapter!.version ?? 1);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-subtle bg-surface-card px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0">
            <h2 className="font-heading text-sm font-semibold text-fg-primary truncate">
              第{chapterNumber}章{chapterTitle ? ` ${chapterTitle}` : ""}
            </h2>
            <p className="font-caption text-[11px] text-fg-muted">
              {wordCount} 字 · v{version}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleWrite}
            disabled={isAnyWriting}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-body text-xs font-medium text-white transition-colors hover:bg-accent-deep disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isThisWriting ? (
              <Loader2 size={13} className="animate-spin" />
            ) : wordCount > 0 ? (
              <RefreshCw size={13} />
            ) : (
              <PenLine size={13} />
            )}
            {isThisWriting ? "生成中..." : wordCount > 0 ? "重新生成" : "生成"}
          </button>
          {!isFileMode && (
            <button
              onClick={handleRevise}
              disabled={isRevising || feedback.length === 0 || isAnyWriting}
              title={feedback.length === 0 ? "请先进行审核获取反馈" : undefined}
              className="flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent-bg/30 px-3 py-1.5 font-body text-xs font-medium text-accent transition-colors hover:bg-accent-bg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRevising ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <RefreshCw size={13} />
              )}
              修订
            </button>
          )}
          <div className="w-px h-5 bg-subtle mx-1" />
          <ReviewActions
            chapterId={isFileMode ? "" : (chapterId ?? "")}
            novelId={novelId ?? ""}
            onTrigger={handleTriggerReview}
          />
          <div className="w-px h-5 bg-subtle mx-1" />
          <button
            onClick={() => handleOpenRewrite()}
            disabled={isAnyWriting || !content}
            title="AI 局部改写"
            className="flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent-bg/30 px-3 py-1.5 font-body text-xs font-medium text-accent transition-colors hover:bg-accent-bg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Wand2 size={13} />
            改写
          </button>
          <div className="w-px h-5 bg-subtle mx-1" />
          <div className="flex items-center rounded-md border border-subtle bg-surface-muted p-0.5">
            <button
              onClick={() => setViewMode("preview")}
              disabled={isAnyWriting}
              className={`flex items-center gap-1 rounded px-2 py-1 font-body text-[11px] transition-colors ${viewMode === "preview" ? "bg-surface-card text-fg-primary shadow-sm" : "text-fg-muted hover:text-fg-secondary"} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Eye size={12} />
              预览
            </button>
            <button
              onClick={() => setViewMode("edit")}
              disabled={isAnyWriting}
              className={`flex items-center gap-1 rounded px-2 py-1 font-body text-[11px] transition-colors ${viewMode === "edit" ? "bg-surface-card text-fg-primary shadow-sm" : "text-fg-muted hover:text-fg-secondary"} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Edit3 size={12} />
              编辑
            </button>
          </div>
          {viewMode === "edit" && (
            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving || isAnyWriting}
              className="flex items-center gap-1.5 rounded-md bg-surface-secondary px-3 py-1.5 font-body text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Save size={13} />
              )}
              保存
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 lg:p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {viewMode === "preview" ? (
            <div ref={contentRef} onMouseUp={handleTextSelection} className="relative">
              <ChapterReading content={content} />
              {selectionPos && selectedText && (
                <button
                  onClick={() => handleOpenRewrite(selectedText)}
                  className="fixed z-50 flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 font-body text-xs font-medium text-white shadow-lg transition-colors hover:bg-accent-deep"
                  style={{ left: selectionPos.x, top: selectionPos.y, transform: "translate(-50%, -100%)" }}
                >
                  <Wand2 size={12} />
                  AI 改写
                </button>
              )}
            </div>
          ) : (
            <textarea
              value={content}
              onChange={handleContentChange}
              className="min-h-[70vh] w-full resize-none rounded-lg border border-subtle bg-surface-card p-6 font-body text-sm text-fg-primary leading-[1.85] focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
              placeholder="开始写作..."
            />
          )}

          {!isFileMode && (
            <ProblemsPanel
              feedback={feedback}
              onAdopt={handleAdopt}
              onIgnore={handleIgnore}
            />
          )}
          {isFileMode && reviewLoading && (
            <div className="flex items-center gap-2 rounded-lg border border-subtle bg-surface-card px-4 py-3">
              <Loader2 size={14} className="animate-spin text-accent" />
              <span className="font-caption text-xs text-fg-muted">审核中...</span>
            </div>
          )}
          {isFileMode && reviewSuggestions.length > 0 && (
            <FileReviewPanel
              suggestions={reviewSuggestions}
              onApply={handleApplySuggestion}
              onIgnore={handleIgnoreSuggestion}
            />
          )}
        </div>
      </div>

      {showRewriteDialog && (
        <RewriteDialog
          chapterId={isFileMode ? undefined : (chapterId ?? undefined)}
          filePath={isFileMode ? filePath : undefined}
          novelId={isFileMode ? novelId ?? undefined : undefined}
          selectedText={selectedText ?? undefined}
          onClose={() => { setShowRewriteDialog(false); setSelectedText(null); }}
          onRewritten={handleRewritten}
        />
      )}
    </div>
  );
}

// ===== File-based Review Panel =====

const severityMap: Record<string, "critical" | "warning" | "suggestion"> = {
  serious: "critical",
  general: "warning",
  detail: "suggestion",
};

function FileReviewPanel({
  suggestions,
  onApply,
  onIgnore,
}: {
  suggestions: ReviewSuggestion[];
  onApply: (s: ReviewSuggestion) => void;
  onIgnore: (s: ReviewSuggestion) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [applyingId, setApplyingId] = useState<number | null>(null);

  const handleApply = async (s: ReviewSuggestion) => {
    setApplyingId(s.id);
    try {
      await onApply(s);
    } finally {
      setApplyingId(null);
    }
  };

  const severityIcon: Record<string, React.ElementType> = {
    critical: AlertCircle,
    warning: AlertTriangle,
    suggestion: Info,
  };
  const severityColor: Record<string, string> = {
    critical: "text-error",
    warning: "text-warning",
    suggestion: "text-info",
  };
  const severityBg: Record<string, string> = {
    critical: "bg-error/10",
    warning: "bg-warning/10",
    suggestion: "bg-info/10",
  };
  const severityLabel: Record<string, string> = {
    serious: "严重",
    general: "一般",
    detail: "细节",
  };
  const statusColor: Record<string, string> = {
    pending: "bg-surface-muted text-fg-muted",
    applied: "bg-success/15 text-success",
    ignored: "bg-fg-muted/10 text-fg-muted",
  };
  const statusLabel: Record<string, string> = {
    pending: "待处理",
    applied: "已采纳",
    ignored: "已忽略",
  };

  return (
    <div className="rounded-lg border border-subtle bg-surface-card">
      <button
        onClick={() => setIsExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={15} className="text-warning" />
          <h3 className="font-heading text-sm font-semibold text-fg-primary">
            审核建议
          </h3>
          <span className="inline-block rounded bg-surface-muted px-1.5 py-0.5 font-caption text-[10px] text-fg-muted">
            {suggestions.length}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp size={15} className="text-fg-muted" />
        ) : (
          <ChevronDown size={15} className="text-fg-muted" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-subtle">
          <div className="max-h-64 overflow-auto">
            {suggestions.length === 0 ? (
              <div className="p-4 text-center">
                <p className="font-caption text-xs text-fg-muted">暂无建议</p>
              </div>
            ) : (
              <ul className="divide-y divide-subtle/50">
                {suggestions.map((item) => {
                  const mapped = severityMap[item.severity] ?? "suggestion";
                  const SevIcon = severityIcon[mapped];
                  return (
                    <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                      <div
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded ${severityBg[mapped]}`}
                      >
                        <SevIcon size={13} className={severityColor[mapped]} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-caption text-[10px] text-fg-muted">
                            {severityLabel[item.severity] ?? item.severity}
                          </span>
                          {item.location && (
                            <span className="font-caption text-[10px] text-fg-muted">
                              {item.location}
                            </span>
                          )}
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 font-caption text-[10px] ${statusColor[item.status] ?? ""}`}
                          >
                            {statusLabel[item.status] ?? item.status}
                          </span>
                        </div>
                        <p className="font-body text-sm text-fg-primary leading-relaxed">
                          {item.description}
                        </p>
                        <p className="font-body text-xs text-fg-secondary mt-1">
                          建议：{item.suggestion}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          {item.status === "pending" && (
                            <>
                              <button
                                onClick={() => handleApply(item)}
                                disabled={applyingId === item.id}
                                className="rounded bg-success/10 px-2 py-0.5 font-caption text-xs text-success transition-colors hover:bg-success/20 disabled:opacity-50"
                              >
                                {applyingId === item.id ? "采纳中..." : "采纳"}
                              </button>
                              <button
                                onClick={() => onIgnore(item)}
                                className="rounded bg-surface-muted px-2 py-0.5 font-caption text-xs text-fg-muted transition-colors hover:bg-surface-secondary"
                              >
                                忽略
                              </button>
                            </>
                          )}
                          {item.status === "applied" && (
                            <button
                              onClick={() => handleApply(item)}
                              disabled={applyingId === item.id}
                              className="rounded bg-accent-bg/30 px-2 py-0.5 font-caption text-xs text-accent transition-colors hover:bg-accent-bg/50 disabled:opacity-50"
                            >
                              {applyingId === item.id ? "重新采纳中..." : "重新采纳"}
                            </button>
                          )}
                          {item.status === "ignored" && (
                            <button
                              onClick={() => onIgnore(item)}
                              className="rounded bg-surface-muted px-2 py-0.5 font-caption text-xs text-fg-muted transition-colors hover:bg-surface-secondary"
                            >
                              撤销忽略
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
