import type { ReactNode } from "react";
import { Modal } from "../ui/Modal";

interface ModalOverlayProps {
  children: ReactNode;
  onClose: () => void;
  maxWidthClass?: string;
}

/**
 * 全局遮罩弹窗。必须 portal 到 body：
 * 侧边栏等祖先若带 transform/animation（panel-enter），fixed 会被关进侧栏。
 * 默认按内容宽度收缩并居中，避免外层 w-full 把定宽子元素顶到左侧。
 */
export function ModalOverlay({ children, onClose, maxWidthClass }: ModalOverlayProps) {
  return (
    <Modal open onClose={onClose} maxWidthClass={maxWidthClass ?? "w-fit max-w-full"}>
      {children}
    </Modal>
  );
}
