/** 流式输出末尾的墨点光标 */
export function InkCaret() {
  return <span className="ink-cursor" aria-hidden="true" />;
}

/**
 * 阅读模式：空内容时的思考指示（非 spinner）
 */
export function ThinkingDots({ label = "思考中" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-caption text-xs text-fg-muted">
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1 w-1 rounded-full bg-accent animate-pulse-soft"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </span>
      {label}
    </span>
  );
}
