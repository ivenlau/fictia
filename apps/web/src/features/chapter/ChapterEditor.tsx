import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Save, Loader2, PenLine, RefreshCw, Eye, Edit3, Wand2 } from "lucide-react";
import { useChapter, useChapterFeedback } from "@/hooks/useNovel";
import { useTriggerChapterAgent } from "@/hooks/useAgent";
import { useAgentStore } from "@/stores/agentStore";
import { useEditorStore } from "@/stores/editorStore";
import { chaptersApi } from "@/api/chapters";
import { pipelinesApi } from "@/api/pipelines";
import { feedbackApi } from "@/api/feedback";
import { ChapterReading } from "./ChapterReading";
import { ReviewActions } from "./ReviewActions";
import { ProblemsPanel } from "./ProblemsPanel";
import { RewriteDialog } from "./RewriteDialog";

interface ChapterEditorProps {
  chapterId?: string;
}

export function ChapterEditor({ chapterId: propChapterId }: ChapterEditorProps = {}) {
  const params = useParams<{ novelId: string; chapterId: string }>();
  const openFiles = useEditorStore((s) => s.openFiles);
  const activeFileId = useEditorStore((s) => s.activeFileId);

  const chapterId = propChapterId ?? params.chapterId;
  // Get novelId from current tab or URL
  const currentTab = openFiles.find((f) => f.id === activeFileId);
  const novelId = currentTab?.novelId ?? params.novelId ?? window.location.pathname.match(/\/novel\/([^/]+)/)?.[1];

  const queryClient = useQueryClient();
  const { data: chapter, isLoading } = useChapter(chapterId);
  const { data: feedback = [], refetch: refetchFeedback } =
    useChapterFeedback(chapterId);
  const triggerAgent = useTriggerChapterAgent(chapterId ?? "");

  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isRevising, setIsRevising] = useState(false);
  const [viewMode, setViewMode] = useState<"preview" | "edit">("preview");
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [showRewriteDialog, setShowRewriteDialog] = useState(false);
  const [selectionPos, setSelectionPos] = useState<{ x: number; y: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const writingChapterId = useAgentStore((s) => s.writingChapterId);
  const setWritingChapter = useAgentStore((s) => s.setWritingChapter);
  const isThisWriting = writingChapterId === chapterId;
  const isAnyWriting = writingChapterId !== null;

  // Sync writing state from backend on mount (for page refresh)
  useEffect(() => {
    if (!novelId || !chapterId) return;
    const checkRunning = async () => {
      try {
        const outputs = await fetch(`/api/novels/${novelId}/agent-outputs`).then(r => r.json());
        const runningWriter = outputs.find(
          (o: any) => o.agentType === "chapter-writer" && (o.status === "running" || o.status === "pending") && o.chapterId,
        );
        if (runningWriter) {
          setWritingChapter(runningWriter.chapterId);
          startPolling(runningWriter.chapterId, novelId, runningWriter.id);
        }
      } catch {}
    };
    checkRunning();
  }, [novelId, chapterId]);

  useEffect(() => {
    if (chapter) {
      setContent(chapter.content ?? "");
      setHasChanges(false);
    }
  }, [chapter]);

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
    setHasChanges(true);
    queryClient.invalidateQueries({ queryKey: ["chapter", chapterId] });
  }, [chapterId, queryClient]);

  const handleSave = useCallback(async () => {
    if (!chapterId || !hasChanges) return;
    setIsSaving(true);
    try {
      await chaptersApi.update(chapterId, { content });
      setHasChanges(false);
    } catch {
      // error handled silently
    } finally {
      setIsSaving(false);
    }
  }, [chapterId, content, hasChanges]);

  const handleTriggerReview = useCallback(
    (type: string): Promise<string | undefined> => {
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
    [triggerAgent, refetchFeedback],
  );

  const handleAdopt = useCallback(async (feedbackId: string) => {
    await feedbackApi.adopt(feedbackId);
    refetchFeedback();
  }, [refetchFeedback]);

  const handleIgnore = useCallback(async (feedbackId: string) => {
    await feedbackApi.ignore(feedbackId);
    refetchFeedback();
  }, [refetchFeedback]);

  const startPolling = useCallback((targetChapterId: string, targetNovelId: string, outputId: string) => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/novels/${targetNovelId}/agent-outputs`);
        const outputs = await res.json();
        const writer = outputs.find((o: any) => o.id === outputId);
        if (writer && writer.status !== "running" && writer.status !== "pending") {
          clearInterval(poll);
          setWritingChapter(null);
          queryClient.invalidateQueries({ queryKey: ["chapters", targetNovelId] });
          queryClient.invalidateQueries({ queryKey: ["chapter", targetChapterId] });
          queryClient.invalidateQueries({ queryKey: ["agent-outputs", targetNovelId] });
          queryClient.invalidateQueries({ queryKey: ["feedback", targetChapterId] });
        }
      } catch {}
    }, 3000);
  }, [queryClient, setWritingChapter]);

  const handleWrite = useCallback(async () => {
    if (!chapterId || !novelId) return;
    setWritingChapter(chapterId);
    try {
      const result = await pipelinesApi.runStage(novelId, "chapters", {
        incrementalTarget: chapterId,
      });
      startPolling(chapterId, novelId, chapterId);
    } catch (err) {
      console.error("Write pipeline failed:", err);
      setWritingChapter(null);
    }
  }, [chapterId, novelId, setWritingChapter, startPolling]);

  const handleRevise = useCallback(async () => {
    if (!chapterId || !novelId) return;
    setIsRevising(true);
    setWritingChapter(chapterId);
    try {
      const result = await pipelinesApi.runStage(novelId, "editor", {
        incrementalTarget: chapterId,
        isRedo: true,
      });
      startPolling(chapterId, novelId, chapterId);
    } catch (err) {
      console.error("Revise pipeline failed:", err);
      setWritingChapter(null);
    } finally {
      setIsRevising(false);
    }
  }, [chapterId, novelId, setWritingChapter, startPolling]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-fg-muted">
          <Loader2 size={16} className="animate-spin" />
          <span className="font-caption text-sm">加载章节...</span>
        </div>
      </div>
    );
  }

  if (!chapter) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-caption text-sm text-fg-muted">章节未找到</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-subtle bg-surface-card px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0">
            <h2 className="font-heading text-sm font-semibold text-fg-primary truncate">
              第{chapter.number}章 {chapter.title}
            </h2>
            <p className="font-caption text-[11px] text-fg-muted">
              {chapter.wordCount} 字 · v{chapter.version}
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
            ) : chapter.wordCount > 0 ? (
              <RefreshCw size={13} />
            ) : (
              <PenLine size={13} />
            )}
            {isThisWriting ? "生成中..." : chapter.wordCount > 0 ? "重新生成" : "生成"}
          </button>
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
          <div className="w-px h-5 bg-subtle mx-1" />
          <ReviewActions
            chapterId={chapterId ?? ""}
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

          <ProblemsPanel
            feedback={feedback}
            onAdopt={handleAdopt}
            onIgnore={handleIgnore}
          />
        </div>
      </div>

      {showRewriteDialog && chapterId && (
        <RewriteDialog
          chapterId={chapterId}
          selectedText={selectedText ?? undefined}
          onClose={() => { setShowRewriteDialog(false); setSelectedText(null); }}
          onRewritten={handleRewritten}
        />
      )}
    </div>
  );
}
