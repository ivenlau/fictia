import { useMutation } from "@tanstack/react-query";
import { Sparkles, Loader2 } from "lucide-react";
import { aiApi } from "@/api/ai";
import type { AiGenerateKind, AiGenerateTextRequest } from "@fictia/shared";

interface AiGenerateButtonProps {
  kind: AiGenerateKind;
  /** 已填字段，拼进 prompt；点击时取最新值 */
  fields: Record<string, string>;
  /** 现有主体文字，作为「更新/扩展」参考 */
  current?: string;
  onResult: (content: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

/**
 * 通用「AI 生成主体文字」按钮：用 AI 助手模型（设置里的对话模型）根据已填信息
 * 生成或更新正文，结果经 onResult 回填。loading 内联转圈，失败内联红字提示。
 */
export function AiGenerateButton({
  kind,
  fields,
  current,
  onResult,
  disabled,
  label = "AI 生成",
  className,
}: AiGenerateButtonProps) {
  const mutation = useMutation({
    mutationFn: (vars: AiGenerateTextRequest) => aiApi.generateText(vars),
    onSuccess: (data) => onResult(data.content),
  });

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => mutation.mutate({ kind, fields, current })}
        disabled={disabled || mutation.isPending}
        className="flex items-center gap-1 rounded-md border border-accent/30 bg-accent/8 px-2 py-1 font-caption text-[11px] text-accent transition-all hover:border-accent/50 hover:bg-accent/15 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
        title="根据已填信息用 AI 生成/更新正文"
      >
        {mutation.isPending ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <Sparkles size={11} />
        )}
        {mutation.isPending ? "生成中…" : label}
      </button>
      {mutation.isError && (
        <span className="font-caption text-[10px] text-error">
          {(mutation.error as Error)?.message ?? "生成失败"}
        </span>
      )}
    </div>
  );
}
