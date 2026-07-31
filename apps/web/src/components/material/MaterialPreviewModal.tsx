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
      <div className="bg-surface-card border border-subtle rounded-lg w-[1280px] max-w-[92vw] max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-subtle">
          <div className="min-w-0">
            <h2 className="font-heading text-base font-semibold text-fg-primary truncate">{title}</h2>
            {description && (
              <p className="font-body text-xs text-fg-muted mt-1">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-fg-muted hover:text-fg-primary transition-colors"
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <MarkdownView>{content}</MarkdownView>
        </div>

        {footer && (
          <div className="px-5 py-3 border-t border-subtle flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </ModalOverlay>
  );
}
