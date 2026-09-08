import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalOverlayProps {
  children: ReactNode;
  onClose: () => void;
}

/**
 * 全局遮罩弹窗。必须 portal 到 body：
 * 侧边栏等祖先若带 transform/animation（panel-enter），fixed 会被关进侧栏。
 */
export function ModalOverlay({ children, onClose }: ModalOverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-[3px] animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="animate-scale-in max-h-full max-w-full"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
