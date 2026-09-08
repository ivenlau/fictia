import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

const EXIT_MS = 140;

/**
 * 统一弹窗基元：进入 scale+fade，退出略快。
 * 必须 portal 到 body，避免侧栏 transform 关住 fixed。
 */
export function Modal({
  open,
  onClose,
  children,
  maxWidthClass = "w-full max-w-lg",
  closeOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** 控制对话框宽度；默认撑满到 max-w-lg。预览类弹窗传 `w-fit max-w-full` 让内容自撑。 */
  maxWidthClass?: string;
  closeOnBackdrop?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [render, setRender] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    setMounted(true);
    setRender(true);
    const raf = requestAnimationFrame(() => setVisible(true));
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const requestClose = useCallback(() => {
    setVisible(false);
    window.setTimeout(() => {
      setRender(false);
      onCloseRef.current();
    }, EXIT_MS);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, requestClose]);

  // 父组件直接关掉 open 时，也走淡出
  useEffect(() => {
    if (!open && render) {
      setVisible(false);
      const t = window.setTimeout(() => setRender(false), EXIT_MS);
      return () => window.clearTimeout(t);
    }
  }, [open, render]);

  if (!mounted || !render) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 transition-opacity duration-150 ${
        visible ? "opacity-100 backdrop-blur-[3px]" : "opacity-0 backdrop-blur-0"
      }`}
      onClick={closeOnBackdrop ? requestClose : undefined}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className={`max-h-full overflow-auto transition-all duration-150 ease-out-expo ${maxWidthClass} ${
          visible ? "scale-100 opacity-100" : "scale-[0.96] opacity-0"
        }`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** 通用确认/表单弹窗外壳 */
export function ModalShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-subtle bg-surface-primary p-5 shadow-theme-panel">
      <h3 className="font-heading text-base font-bold text-fg-primary mb-2">{title}</h3>
      {description && (
        <div className="font-body text-sm text-fg-secondary mb-3">{description}</div>
      )}
      {children}
      <div className="mt-4 flex justify-end gap-2">{footer}</div>
    </div>
  );
}

/** 确认按钮统一态 */
export function ModalButton({
  onClick,
  tone = "neutral",
  disabled,
  children,
}: {
  onClick: () => void;
  tone?: "neutral" | "primary" | "danger" | "warning";
  disabled?: boolean;
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    neutral:
      "border border-subtle bg-surface-card text-fg-secondary hover:bg-surface-muted",
    primary: "bg-accent text-accent-ink hover:bg-accent-light",
    danger: "bg-error text-accent-ink hover:opacity-90",
    warning: "bg-warning text-accent-ink hover:opacity-90",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`btn-press rounded-md px-4 py-2 font-body text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${tones[tone]}`}
    >
      {children}
    </button>
  );
}
