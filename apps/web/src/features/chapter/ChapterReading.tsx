import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChapterReadingProps {
  content: string;
  /** 空内容时的提示文案，默认「章节内容为空」；设计文档等场景可覆盖。 */
  emptyLabel?: string;
}

export function ChapterReading({ content, emptyLabel = "章节内容为空" }: ChapterReadingProps) {
  if (!content) {
    return (
      <div className="rounded-lg border border-dashed border-strong bg-surface-muted p-8 text-center">
        <p className="font-body text-sm text-fg-muted">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-subtle bg-surface-card p-6 lg:p-8">
      <article className="prose prose-sm max-w-none font-body text-fg-primary leading-[1.85] [&>h1]:font-heading [&>h1]:text-xl [&>h1]:font-bold [&>h1]:mb-4 [&>h2]:font-heading [&>h2]:text-lg [&>h2]:font-semibold [&>h2]:mb-3 [&>h3]:font-heading [&>h3]:text-base [&>h3]:font-semibold [&>h3]:mb-2 [&>p]:mb-4 [&>p]:text-fg-primary [&>blockquote]:border-l-2 [&>blockquote]:border-accent/40 [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:text-fg-secondary [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:mb-4 [&>ol]:list-decimal [&>ol]:pl-5 [&>ol]:mb-4 [&>li]:mb-1 [&>code]:font-caption [&>code]:text-xs [&>code]:bg-surface-muted [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:rounded [&>hr]:border-subtle [&>hr]:my-6">
        <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
      </article>
    </div>
  );
}
