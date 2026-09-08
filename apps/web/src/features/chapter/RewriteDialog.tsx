import { useState, useCallback } from "react";
import { Loader2, Wand2, X } from "lucide-react";
import { agentsApi } from "@/api/agents";

interface RewriteDialogProps {
  chapterId?: string;
  filePath?: string;
  novelId?: string;
  selectedText?: string;
  onClose: () => void;
  onRewritten: (updatedContent: string) => void;
}

export function RewriteDialog({ chapterId, filePath, novelId, selectedText, onClose, onRewritten }: RewriteDialogProps) {
  const [instruction, setInstruction] = useState("");
  const [isRewriting, setIsRewriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFileMode = !!filePath && !!novelId;

  const handleRewrite = useCallback(async () => {
    if (!instruction.trim()) return;
    setIsRewriting(true);
    setError(null);

    try {
      let updatedContent: string;

      if (isFileMode) {
        const result = await agentsApi.fileRewrite(novelId!, {
          filePath: filePath!,
          selectedText: selectedText || undefined,
          instruction: instruction.trim(),
        });
        updatedContent = result.updatedContent;
      } else if (chapterId) {
        const result = await agentsApi.rewrite(chapterId, {
          selectedText: selectedText || undefined,
          instruction: instruction.trim(),
        });
        updatedContent = result.updatedContent;
      } else {
        return;
      }

      onRewritten(updatedContent);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "改写失败，请重试");
    } finally {
      setIsRewriting(false);
    }
  }, [isFileMode, novelId, filePath, chapterId, selectedText, instruction, onRewritten, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-subtle bg-surface-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-subtle px-5 py-3">
          <div className="flex items-center gap-2">
            <Wand2 size={16} className="text-accent" />
            <h3 className="font-heading text-sm font-semibold text-fg-primary">AI 局部改写</h3>
          </div>
          <button onClick={onClose} className="rounded p-1 text-fg-muted hover:text-fg-primary hover:bg-surface-muted">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {selectedText && (
            <div>
              <label className="mb-1.5 block font-caption text-xs font-medium text-fg-secondary">选中的文本</label>
              <div className="max-h-32 overflow-auto rounded-lg border border-subtle bg-surface-muted p-3 font-body text-sm text-fg-secondary leading-relaxed">
                {selectedText}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1.5 block font-caption text-xs font-medium text-fg-secondary">
              改写指令
            </label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={selectedText ? "例如：让这段描写更生动，增加感官细节" : "例如：重写第三段的对话，让语气更紧张"}
              className="h-24 w-full resize-none rounded-lg border border-subtle bg-surface-card p-3 font-body text-sm text-fg-primary placeholder:text-fg-muted/50 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
              disabled={isRewriting}
              autoFocus
            />
          </div>

          {error && (
            <p className="rounded-md bg-error/10 px-3 py-2 font-caption text-xs text-error">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-subtle px-5 py-3">
          <button
            onClick={onClose}
            disabled={isRewriting}
            className="rounded-md px-3 py-1.5 font-body text-xs text-fg-secondary hover:bg-surface-muted disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleRewrite}
            disabled={!instruction.trim() || isRewriting}
            className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 font-body text-xs font-medium text-accent-ink transition-colors hover:bg-accent-light disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRewriting ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                改写中...
              </>
            ) : (
              <>
                <Wand2 size={13} />
                开始改写
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
