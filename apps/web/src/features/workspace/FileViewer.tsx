import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Folder,
  Pencil,
  Save,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Eye,
  Edit3,
  Wand2,
  Wrench,
  ChevronDown,
} from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import { novelsApi } from "@/api/novels";
import { customToolsApi } from "@/api/custom-tools";
import { ChapterEditor } from "@/features/chapter/ChapterEditor";
import { ChapterReading } from "@/features/chapter/ChapterReading";
import { RewriteDialog } from "@/features/chapter/RewriteDialog";
import { RunToolDialog } from "@/components/tools/RunToolDialog";
import type { WorkspaceFile, CustomToolDef } from "@fictia/shared";

function getFileType(path: string): "json" | "yaml" | "markdown" {
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".yml") || path.endsWith(".yaml")) return "yaml";
  return "markdown";
}

function validateContent(content: string, fileType: "json" | "yaml" | "markdown"): string | null {
  if (fileType === "json") {
    try {
      JSON.parse(content);
      return null;
    } catch (e: any) {
      return `JSON 格式错误：${e.message}`;
    }
  }
  if (fileType === "yaml") {
    // Basic YAML validation: check for obvious syntax issues
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim() || line.trim().startsWith("#")) continue;
      // Check for tabs (not allowed in YAML)
      if (line.includes("\t")) {
        return `YAML 格式错误：第 ${i + 1} 行包含 Tab 缩进，请使用空格`;
      }
    }
    return null;
  }
  return null;
}

interface FileViewerProps {
  fileId: string;
}

export function FileViewer({ fileId }: FileViewerProps) {
  const queryClient = useQueryClient();
  const openFiles = useEditorStore((s) => s.openFiles);
  const activeFile = openFiles.find((f) => f.id === fileId);

  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // json/yaml edit buffer (legacy edit/cancel flow with validation)
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");

  // markdown view mode (preview/edit toggle, mirrors ChapterEditor)
  const [viewMode, setViewMode] = useState<"preview" | "edit">("preview");
  const [hasChanges, setHasChanges] = useState(false);

  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // AI rewrite state (markdown)
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [selectionPos, setSelectionPos] = useState<{ x: number; y: number } | null>(null);
  const [showRewriteDialog, setShowRewriteDialog] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // 自定义工具下拉 + 运行弹窗
  const [customTools, setCustomTools] = useState<CustomToolDef[]>([]);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [runTool, setRunTool] = useState<CustomToolDef | null>(null);
  useEffect(() => {
    customToolsApi
      .list()
      .then((ts) => setCustomTools(ts.filter((t) => t.enabled)))
      .catch(() => {});
  }, []);

  const fileType = activeFile?.type === "workspace" ? getFileType(activeFile.path) : "markdown";
  const isMarkdown = fileType === "markdown";

  useEffect(() => {
    if (!activeFile || activeFile.type === "chapter") return;

    setLoading(true);
    setContent("");
    setEditing(false);
    setEditContent("");
    setViewMode("preview");
    setHasChanges(false);
    setValidationError(null);
    setSaveSuccess(false);
    setSelectedText(null);
    setSelectionPos(null);

    if (activeFile.type === "workspace") {
      const novelId = activeFile.novelId;
      if (!novelId) {
        setContent("无法确定小说 ID");
        setLoading(false);
        return;
      }
      novelsApi.getFiles(novelId).then((files: WorkspaceFile[]) => {
        const file = files.find((f: WorkspaceFile) => f.id === activeFile.id);
        setContent(file?.content ?? "");
        setLoading(false);
      }).catch(() => {
        setContent("加载失败");
        setLoading(false);
      });
    }
  }, [activeFile?.id, activeFile?.type]);

  // ---- json/yaml edit handlers (unchanged) ----
  const handleEnterEdit = useCallback(() => {
    setEditContent(content);
    setEditing(true);
    setValidationError(null);
    setSaveSuccess(false);
  }, [content]);

  const handleCancelEdit = useCallback(() => {
    setEditing(false);
    setEditContent("");
    setValidationError(null);
  }, []);

  const handleEditChange = useCallback((value: string) => {
    setEditContent(value);
    setValidationError(null);
    setSaveSuccess(false);
  }, []);

  const handleMarkdownChange = useCallback((value: string) => {
    setContent(value);
    setHasChanges(true);
    setSaveSuccess(false);
  }, []);

  // Unified save: markdown writes `content` directly; json/yaml writes the edit buffer with validation.
  const handleSave = useCallback(async () => {
    if (!activeFile || activeFile.type !== "workspace" || !activeFile.novelId) return;

    const theContent = isMarkdown ? content : editContent;
    if (!isMarkdown) {
      const error = validateContent(editContent, fileType);
      if (error) {
        setValidationError(error);
        return;
      }
    }

    setSaving(true);
    setValidationError(null);
    try {
      await novelsApi.updateFile(activeFile.novelId, activeFile.path, theContent);
      setContent(theContent);
      setHasChanges(false);
      if (!isMarkdown) {
        setEditing(false);
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      setValidationError("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }, [activeFile, isMarkdown, fileType, content, editContent]);

  // ---- AI rewrite (markdown) ---- mirrors ChapterEditor
  const handleTextSelection = useCallback(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (text && text.length > 0 && contentRef.current) {
      const range = sel!.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const container = contentRef.current.getBoundingClientRect();
      setSelectedText(text);
      // 用内容区坐标 + absolute，避免 fixed 盖住左侧调试面板
      setSelectionPos({
        x: rect.left + rect.width / 2 - container.left + contentRef.current.scrollLeft,
        y: rect.top - 8 - container.top + contentRef.current.scrollTop,
      });
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
    setHasChanges(false);
    setSelectedText(null);
    if (activeFile?.novelId) {
      queryClient.invalidateQueries({ queryKey: ["workspace-files", activeFile.novelId] });
    }
  }, [activeFile?.novelId, queryClient]);

  // Ctrl+S to save (markdown edit mode, or json/yaml editing mode)
  useEffect(() => {
    const inEdit = isMarkdown ? viewMode === "edit" : editing;
    if (!inEdit) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isMarkdown, viewMode, editing, handleSave]);

  if (!activeFile) return null;

  // Chapter files open the full ChapterEditor
  if (activeFile.type === "chapter") {
    return <ChapterEditor chapterId={activeFile.id} />;
  }

  // Workspace files under chapters/ also use ChapterEditor (file-based mode)
  if (activeFile.type === "workspace" && activeFile.path.startsWith("chapters/") && activeFile.novelId) {
    return (
      <ChapterEditor
        filePath={activeFile.path}
        novelId={activeFile.novelId}
      />
    );
  }

  const Icon = activeFile.type === "workspace" ? Folder : FileText;
  const inEdit = isMarkdown ? viewMode === "edit" : editing;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* File header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-subtle bg-surface-card">
        <Icon size={15} className="text-accent" />
        <span className="font-body text-sm font-medium text-fg-primary truncate">
          {activeFile.label}
        </span>
        <span className="font-caption text-[11px] text-fg-muted ml-2 truncate hidden sm:inline">
          {activeFile.path}
        </span>

        <div className="flex-1" />

        {/* Status indicators */}
        {saveSuccess && (
          <span className="flex items-center gap-1 font-caption text-xs text-accent">
            <CheckCircle2 size={12} />
            已保存
          </span>
        )}
        {validationError && (
          <span className="flex items-center gap-1 font-caption text-xs text-error max-w-[300px] truncate">
            <AlertCircle size={12} />
            {validationError}
          </span>
        )}

        {/* Action buttons */}
        {activeFile.type === "workspace" && (
          isMarkdown ? (
            <>
              <button
                onClick={() => handleOpenRewrite()}
                disabled={!content}
                title="AI 改写"
                className="flex items-center gap-1 rounded-md border border-accent/40 bg-accent-bg/30 px-2.5 py-1.5 font-body text-[11px] font-medium text-accent transition-colors hover:bg-accent-bg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Wand2 size={12} />
                改写
              </button>
              {/* 自定义工具下拉：选工具 → 参数匹配弹窗（用户输入/当前文档/指定文档）→ 结果弹窗 */}
              <div className="relative">
                <button
                  onClick={() => setShowToolsMenu((v) => !v)}
                  disabled={customTools.length === 0}
                  title="运行自定义工具"
                  className="flex items-center gap-1 rounded-md border border-subtle bg-surface-muted px-2.5 py-1.5 font-body text-[11px] font-medium text-fg-secondary transition-colors hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Wrench size={12} />
                  工具
                  <ChevronDown size={10} />
                </button>
                {showToolsMenu && customTools.length > 0 && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowToolsMenu(false)} />
                    <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-md border border-subtle bg-surface-card py-1 shadow-lg">
                      {customTools.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setRunTool(t);
                            setShowToolsMenu(false);
                          }}
                          className="block w-full px-2.5 py-1.5 text-left font-caption text-[11px] text-fg-primary hover:bg-accent-bg/40"
                          title={t.description}
                        >
                          <span className="font-medium">{t.label || t.name}</span>
                          <span className="ml-1.5 text-fg-muted">{t.kind.kind}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="w-px h-5 bg-subtle mx-1" />
              <div className="flex items-center rounded-md border border-subtle bg-surface-muted p-0.5">
                <button
                  onClick={() => setViewMode("preview")}
                  className={`flex items-center gap-1 rounded px-2 py-1 font-body text-[11px] transition-colors ${viewMode === "preview" ? "bg-surface-card text-fg-primary shadow-sm" : "text-fg-muted hover:text-fg-secondary"}`}
                >
                  <Eye size={12} />
                  预览
                </button>
                <button
                  onClick={() => setViewMode("edit")}
                  className={`flex items-center gap-1 rounded px-2 py-1 font-body text-[11px] transition-colors ${viewMode === "edit" ? "bg-surface-card text-fg-primary shadow-sm" : "text-fg-muted hover:text-fg-secondary"}`}
                >
                  <Edit3 size={12} />
                  编辑
                </button>
              </div>
              {viewMode === "edit" && (
                <button
                  onClick={handleSave}
                  disabled={!hasChanges || saving}
                  className="flex items-center gap-1.5 rounded-md bg-surface-secondary px-2.5 py-1.5 font-body text-[11px] font-medium text-fg-secondary transition-colors hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  保存
                </button>
              )}
            </>
          ) : (
            editing ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 font-body text-[11px] font-medium text-accent-ink transition-colors hover:bg-accent-light disabled:opacity-50"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  保存
                </button>
                <button
                  onClick={handleCancelEdit}
                  disabled={saving}
                  className="flex items-center gap-1 rounded-md border border-subtle bg-surface-card px-2.5 py-1.5 font-body text-[11px] text-fg-secondary transition-colors hover:bg-surface-muted disabled:opacity-50"
                >
                  <X size={12} />
                  取消
                </button>
              </div>
            ) : (
              <button
                onClick={handleEnterEdit}
                className="flex items-center gap-1 rounded-md border border-subtle bg-surface-card px-2.5 py-1.5 font-body text-[11px] text-fg-secondary transition-colors hover:bg-surface-muted"
              >
                <Pencil size={12} />
                编辑
              </button>
            )
          )
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-fg-muted font-caption text-sm">
            加载中...
          </div>
        ) : isMarkdown ? (
          viewMode === "preview" ? (
            <div ref={contentRef} onMouseUp={handleTextSelection} className="relative flex-1 overflow-auto">
              <div className="mx-auto max-w-7xl p-4 lg:p-6">
                <ChapterReading content={content} emptyLabel="文档内容为空" />
              </div>
              {selectionPos && selectedText && (
                <button
                  onClick={() => handleOpenRewrite(selectedText)}
                  className="absolute z-20 flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 font-body text-xs font-medium text-accent-ink shadow-lg transition-colors hover:bg-accent-light"
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
              onChange={(e) => handleMarkdownChange(e.target.value)}
              spellCheck={false}
              placeholder="开始编写文档..."
              className="flex-1 w-full resize-none p-5 font-body text-sm text-fg-primary bg-surface-primary leading-[1.85] focus:outline-none"
            />
          )
        ) : editing ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <textarea
              value={editContent}
              onChange={(e) => handleEditChange(e.target.value)}
              spellCheck={false}
              className="flex-1 w-full resize-none p-5 font-mono text-sm text-fg-primary bg-surface-primary leading-relaxed focus:outline-none"
            />
          </div>
        ) : (
          <pre className="h-full overflow-auto p-5 font-body text-sm text-fg-primary whitespace-pre-wrap leading-relaxed">
            {content}
          </pre>
        )}
      </div>

      {/* Footer hint */}
      {inEdit && (
        <div className="flex items-center gap-3 px-4 py-1.5 border-t border-subtle bg-surface-card">
          <span className="font-caption text-[11px] text-fg-muted">
            {fileType === "json" && "JSON 格式 · 保存时自动校验"}
            {fileType === "yaml" && "YAML 格式 · 保存时自动校验"}
            {fileType === "markdown" && "Markdown 格式"}
          </span>
          <span className="font-caption text-[11px] text-fg-muted ml-auto">
            Ctrl+S 保存
          </span>
        </div>
      )}

      {showRewriteDialog && activeFile.type === "workspace" && activeFile.novelId && (
        <RewriteDialog
          filePath={activeFile.path}
          novelId={activeFile.novelId}
          selectedText={selectedText ?? undefined}
          onClose={() => { setShowRewriteDialog(false); setSelectedText(null); }}
          onRewritten={handleRewritten}
        />
      )}
      {runTool && activeFile.novelId && (
        <RunToolDialog
          tool={runTool}
          novelId={activeFile.novelId}
          currentDocContent={content}
          currentDocPath={activeFile.path}
          onClose={() => setRunTool(null)}
        />
      )}
    </div>
  );
}
