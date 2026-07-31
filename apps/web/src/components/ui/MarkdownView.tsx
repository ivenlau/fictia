import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * 可复用的 Markdown 渲染器（紧凑版样式，适配侧边栏/弹窗）。
 * 样式与 ChapterReading 同源，缩字号以适合素材库面板宽度。
 */
const PROSE_CLASS =
  "prose prose-sm max-w-none font-body text-fg-primary leading-[1.7] " +
  "[&>h1]:font-heading [&>h1]:text-base [&>h1]:font-bold [&>h1]:mb-3 " +
  "[&>h2]:font-heading [&>h2]:text-sm [&>h2]:font-semibold [&>h2]:mb-2 [&>h2]:mt-4 " +
  "[&>h3]:font-heading [&>h3]:text-[13px] [&>h3]:font-semibold [&>h3]:mb-1.5 " +
  "[&>p]:mb-3 [&>p]:text-[13px] " +
  "[&>blockquote]:border-l-2 [&>blockquote]:border-accent/40 [&>blockquote]:pl-3 [&>blockquote]:italic [&>blockquote]:text-fg-secondary " +
  "[&>ul]:list-disc [&>ul]:pl-5 [&>ul]:mb-3 [&>ol]:list-decimal [&>ol]:pl-5 [&>ol]:mb-3 " +
  "[&>li]:mb-1 [&>li]:text-[13px] " +
  "[&>code]:font-caption [&>code]:text-xs [&>code]:bg-surface-muted [&>code]:px-1 [&>code]:py-0.5 [&>code]:rounded " +
  "[&>pre]:bg-surface-muted [&>pre]:p-2 [&>pre]:rounded [&>pre]:text-xs [&>pre]:overflow-x-auto " +
  "[&>hr]:border-subtle [&>hr]:my-4 " +
  "[&_table]:w-full [&_table]:border-collapse [&_table]:my-3 [&_table]:text-xs " +
  "[&_thead]:bg-surface-muted/50 " +
  "[&_th]:border [&_th]:border-subtle [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold " +
  "[&_td]:border [&_td]:border-subtle [&_td]:px-2 [&_td]:py-1 [&_td]:align-top";

export function MarkdownView({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className}>
      <Markdown remarkPlugins={[remarkGfm]} className={PROSE_CLASS}>
        {children}
      </Markdown>
    </div>
  );
}
