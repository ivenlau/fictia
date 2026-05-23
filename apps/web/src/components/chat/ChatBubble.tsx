import { Bot } from "lucide-react";

interface ChatBubbleProps {
  type: "user" | "agent";
  content: string;
}

export function ChatBubble({ type, content }: ChatBubbleProps) {
  const isUser = type === "user";

  return (
    <div
      className={`flex gap-2 max-w-[80%] ${isUser ? "ml-auto flex-row-reverse" : ""}`}
    >
      {!isUser && (
        <div className="w-7 h-7 flex items-center justify-center rounded-full bg-surface-muted shrink-0">
          <Bot size={14} className="text-fg-secondary" />
        </div>
      )}
      <div
        className={`px-3 py-2 rounded-lg text-[13px] font-body leading-relaxed ${
          isUser
            ? "bg-accent-bg text-fg-primary"
            : "bg-surface-muted text-fg-primary"
        }`}
      >
        {content}
      </div>
    </div>
  );
}
