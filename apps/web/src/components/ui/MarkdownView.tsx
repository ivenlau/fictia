import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * 暗色 Markdown 渲染（素材预览 / 体裁卡等）。
 * 注意：react-markdown v9 不再接受 className，必须包一层 wrapper。
 */
const WRAPPER_CLASS = [
  "md-view",
  "max-w-none",
  "font-body",
  "text-[13.5px]",
  "leading-[1.8]",
  "text-fg-secondary",
  "[&_h1]:mb-3 [&_h1]:mt-1 [&_h1]:font-display [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-fg-primary",
  "[&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:font-display [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-fg-primary",
  "[&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:font-display [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:text-fg-primary",
  "[&_h4]:mb-1 [&_h4]:mt-3 [&_h4]:font-semibold [&_h4]:text-[12px] [&_h4]:text-fg-primary",
  "[&_p]:mb-3 [&_p]:text-fg-secondary",
  "[&_strong]:text-fg-primary [&_strong]:font-semibold",
  "[&_em]:text-fg-secondary",
  "[&_a]:text-cyan [&_a]:underline [&_a]:underline-offset-2",
  "[&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1",
  "[&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1",
  "[&_li]:text-fg-secondary",
  "[&_li>ul]:mt-1 [&_li>ol]:mt-1",
  "[&_blockquote]:mb-3 [&_blockquote]:border-l-2 [&_blockquote]:border-accent/50 [&_blockquote]:bg-accent/5 [&_blockquote]:py-1.5 [&_blockquote]:pl-3 [&_blockquote]:pr-2 [&_blockquote]:text-fg-muted [&_blockquote]:italic",
  "[&_code]:rounded [&_code]:bg-surface-elevated [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-caption [&_code]:text-[12px] [&_code]:text-accent",
  "[&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-subtle [&_pre]:bg-surface-inset [&_pre]:p-3",
  "[&_pre>code]:bg-transparent [&_pre>code]:p-0 [&_pre>code]:text-fg-secondary",
  "[&_hr]:my-4 [&_hr]:border-subtle",
  "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs",
  "[&_thead]:bg-surface-elevated",
  "[&_th]:border [&_th]:border-subtle [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-fg-primary",
  "[&_td]:border [&_td]:border-subtle [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_td]:text-fg-secondary",
  "[&_tr:nth-child(even)]:bg-surface-inset/40",
].join(" ");

export function MarkdownView({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={`${WRAPPER_CLASS} ${className}`}>
      <Markdown remarkPlugins={[remarkGfm]}>{children}</Markdown>
    </div>
  );
}
