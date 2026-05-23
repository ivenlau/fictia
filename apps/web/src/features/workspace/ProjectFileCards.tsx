import {
  FileText,
  FileJson,
  FileCode,
  Folder,
  ChevronRight,
} from "lucide-react";
import type { WorkspaceFile } from "@fictia/shared";

interface ProjectFileCardsProps {
  files: WorkspaceFile[];
  onOpen: (file: WorkspaceFile) => void;
}

const fileIcons: Record<string, React.ElementType> = {
  markdown: FileText,
  json: FileJson,
  yaml: FileCode,
  folder: Folder,
};

const fileTypeLabels: Record<string, string> = {
  markdown: "Markdown",
  json: "JSON",
  yaml: "YAML",
  folder: "文件夹",
};

export function ProjectFileCards({ files, onOpen }: ProjectFileCardsProps) {
  if (files.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-strong bg-surface-muted p-6 text-center">
        <Folder size={24} className="mx-auto mb-2 text-fg-muted" />
        <p className="font-caption text-xs text-fg-muted">暂无项目文件</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {files.map((file) => {
        const Icon = fileIcons[file.type] ?? FileText;
        return (
          <button
            key={file.id}
            onClick={() => onOpen(file)}
            className="group flex items-start gap-3 rounded-lg border border-subtle bg-surface-card p-3.5 text-left transition-colors hover:border-accent/40 hover:bg-accent-bg/30"
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-muted text-fg-muted group-hover:text-accent group-hover:bg-accent-bg transition-colors">
              <Icon size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-body text-sm text-fg-primary truncate">
                {file.path.split("/").pop()}
              </p>
              <p className="font-caption text-xs text-fg-muted mt-0.5 truncate">
                {file.path}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="inline-block rounded bg-surface-muted px-1.5 py-0.5 font-caption text-[10px] text-fg-muted">
                {fileTypeLabels[file.type] ?? file.type}
              </span>
              <ChevronRight
                size={14}
                className="text-fg-muted opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
