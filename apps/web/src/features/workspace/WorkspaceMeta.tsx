import { FileText, Tag, BookOpen, Calendar } from "lucide-react";
import type { Novel } from "@fictia/shared";

interface WorkspaceMetaProps {
  novel: Novel;
}

export function WorkspaceMeta({ novel }: WorkspaceMetaProps) {
  const statusLabels: Record<string, string> = {
    creating: "创建中",
    researching: "研究中",
    writing: "写作中",
    reviewing: "审阅中",
    completed: "已完成",
  };

  const statusColors: Record<string, string> = {
    creating: "bg-warning/15 text-warning",
    researching: "bg-info/15 text-info",
    writing: "bg-accent/15 text-accent",
    reviewing: "bg-accent-rose/15 text-accent-rose",
    completed: "bg-success/15 text-success",
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-subtle bg-surface-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={15} className="text-accent" />
          <h3 className="font-heading text-sm font-semibold text-fg-primary">
            README
          </h3>
        </div>
        <p className="font-body text-sm text-fg-secondary leading-relaxed whitespace-pre-wrap">
          {novel.description || "暂无描述。点击编辑来添加小说简介。"}
        </p>
      </div>

      <div className="rounded-lg border border-subtle bg-surface-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Tag size={15} className="text-accent" />
          <h3 className="font-heading text-sm font-semibold text-fg-primary">
            元数据
          </h3>
        </div>
        <dl className="space-y-2.5">
          <div className="flex items-center justify-between">
            <dt className="font-caption text-xs text-fg-muted">题材</dt>
            <dd className="font-body text-sm text-fg-primary">{novel.genre}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="font-caption text-xs text-fg-muted">目标章节</dt>
            <dd className="font-body text-sm text-fg-primary">
              <span className="flex items-center gap-1.5">
                <BookOpen size={13} className="text-fg-muted" />
                {novel.targetChapters} 章
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="font-caption text-xs text-fg-muted">状态</dt>
            <dd>
              <span
                className={`inline-block px-2 py-0.5 rounded text-xs font-caption ${statusColors[novel.status] ?? "bg-surface-muted text-fg-muted"}`}
              >
                {statusLabels[novel.status] ?? novel.status}
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="font-caption text-xs text-fg-muted">创建时间</dt>
            <dd className="font-body text-sm text-fg-primary flex items-center gap-1.5">
              <Calendar size={13} className="text-fg-muted" />
              {new Date(novel.createdAt).toLocaleDateString("zh-CN")}
            </dd>
          </div>
          {novel.tags.length > 0 && (
            <div className="pt-1">
              <dt className="font-caption text-xs text-fg-muted mb-1.5">标签</dt>
              <dd className="flex flex-wrap gap-1.5">
                {novel.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-block px-2 py-0.5 rounded bg-accent-bg text-accent text-xs font-caption"
                  >
                    {tag}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
