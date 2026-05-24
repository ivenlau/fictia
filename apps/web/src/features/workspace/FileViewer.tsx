import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  BookOpen,
  Folder,
  Pencil,
  Save,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import { novelsApi } from "@/api/novels";
import { chaptersApi } from "@/api/chapters";
import { ChapterEditor } from "@/features/chapter/ChapterEditor";
import type { WorkspaceFile, Chapter } from "@fictia/shared";

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
  const openFiles = useEditorStore((s) => s.openFiles);
  const activeFile = openFiles.find((f) => f.id === fileId);

  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!activeFile || activeFile.type === "chapter") return;

    setLoading(true);
    setContent("");
    setEditing(false);
    setEditContent("");
    setValidationError(null);
    setSaveSuccess(false);

    if (activeFile.type === "workspace") {
      const novelId = activeFile.novelId;
      if (!novelId) {
        setContent("无法确定小说 ID");
        setLoading(false);
        return;
      }
      novelsApi.getFiles(novelId).then((files: WorkspaceFile[]) => {
        const file = files.find((f: WorkspaceFile) => f.id === activeFile.id);
        setContent(file?.content ?? "文件内容为空");
        setLoading(false);
      }).catch(() => {
        setContent("加载失败");
        setLoading(false);
      });
    }
  }, [activeFile?.id, activeFile?.type]);

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

  const handleSave = useCallback(async () => {
    if (!activeFile || activeFile.type !== "workspace" || !activeFile.novelId) return;

    const fileType = getFileType(activeFile.path);
    const error = validateContent(editContent, fileType);
    if (error) {
      setValidationError(error);
      return;
    }

    setSaving(true);
    setValidationError(null);
    try {
      await novelsApi.updateFile(activeFile.novelId, activeFile.path, editContent);
      setContent(editContent);
      setEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      setValidationError("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }, [activeFile, editContent]);

  // Handle Ctrl+S to save
  useEffect(() => {
    if (!editing) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editing, handleSave]);

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
  const fileType = activeFile.type === "workspace" ? getFileType(activeFile.path) : "markdown";

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* File header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-subtle bg-surface-card">
        <Icon size={15} className="text-accent" />
        <span className="font-body text-sm font-medium text-fg-primary">
          {activeFile.label}
        </span>
        <span className="font-caption text-[11px] text-fg-muted ml-2">
          {activeFile.path}
        </span>

        <div className="flex-1" />

        {/* Status indicators */}
        {saveSuccess && (
          <span className="flex items-center gap-1 font-caption text-xs text-success">
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
          editing ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 font-body text-[11px] font-medium text-white transition-colors hover:bg-accent-deep disabled:opacity-50"
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
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-fg-muted font-caption text-sm">
            加载中...
          </div>
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
      {editing && (
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
    </div>
  );
}
