import type { ReactNode } from "react";
import { X } from "lucide-react";
import { ModalOverlay } from "@/components/layout/ModalOverlay";
import { MarkdownView } from "@/components/ui/MarkdownView";

interface MaterialPreviewModalProps {
  title: string;
  description?: string;
  content: string;
  onClose: () => void;
  footer?: ReactNode;
}

/** 素材全文预览弹窗：标题 + 描述 + Markdown 正文 + 可选操作栏。 */
export function MaterialPreviewModal({
  title,
  description,
  content,
  onClose,
  footer,
}: MaterialPreviewModalProps) {
  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex max-h-[82vh] h-[min(82vh,900px)] w-[min(920px,92vw)] flex-col overflow-hidden rounded-2xl border border-subtle bg-surface-card shadow-panel">
        <div className="flex items-start justify-between gap-3 border-b border-subtle bg-surface-secondary/60 px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg font-bold text-fg-primary">
              {title}
            </h2>
            {description && (
              <p className="mt-1 line-clamp-2 font-body text-xs leading-relaxed text-fg-muted">
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-elevated hover:text-fg-primary"
            title="关闭"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-surface-inset/40 px-6 py-5">
          <div className="mx-auto max-w-[720px] rounded-xl border border-subtle bg-surface-card p-6 shadow-card">
            <MarkdownView>{content}</MarkdownView>
          </div>
        </div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-subtle bg-surface-secondary/60 px-6 py-3">
            {footer}
          </div>
        )}
      </div>
    </ModalOverlay>
  );
}
