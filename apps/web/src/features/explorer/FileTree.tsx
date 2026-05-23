import { useState, useMemo, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  FileJson,
  FileCode,
  BookOpen,
} from "lucide-react";
import type { WorkspaceFile, Chapter } from "@fictia/shared";
import { useEditorStore } from "@/stores/editorStore";

interface FileTreeProps {
  files: WorkspaceFile[];
  chapters: Chapter[];
}

interface TreeNode {
  name: string;
  path: string;
  type: "folder" | "file" | "chapter";
  children?: TreeNode[];
  file?: WorkspaceFile;
  chapter?: Chapter;
}

const fileIcons: Record<string, React.ElementType> = {
  markdown: FileText,
  json: FileJson,
  yaml: FileCode,
};

function buildTree(files: WorkspaceFile[], chapters: Chapter[]): TreeNode[] {
  const root: TreeNode[] = [];
  const folderMap = new Map<string, TreeNode>();

  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sorted) {
    const parts = file.path.split("/");
    let currentLevel = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const folderPath = parts.slice(0, i + 1).join("/");
      let folder = folderMap.get(folderPath);

      if (!folder) {
        folder = {
          name: parts[i],
          path: folderPath,
          type: "folder",
          children: [],
        };
        folderMap.set(folderPath, folder);
        currentLevel.push(folder);
      }
      currentLevel = folder.children!;
    }

    const fileName = parts[parts.length - 1];
    // Skip .gitkeep files — they only exist to keep folders visible
    if (fileName === ".gitkeep") continue;
    currentLevel.push({
      name: fileName,
      path: file.path,
      type: "file",
      file,
    });
  }

  // Merge chapters into the tree
  if (chapters.length > 0) {
    // Sort chapters by number
    const sortedChapters = [...chapters].sort((a, b) => a.number - b.number);

    for (const ch of sortedChapters) {
      // Determine the path: use filename if available, otherwise generate one
      let chapterPath: string;
      if (ch.filename) {
        // filename might be "act-1/ch01.md" or just "ch01.md"
        chapterPath = `chapters/${ch.filename}`;
      } else {
        // Generate a default path based on chapter number
        const actNum = ch.number <= 10 ? 1 : ch.number <= 20 ? 2 : 3;
        chapterPath = `chapters/act-${actNum}/ch${String(ch.number).padStart(2, "0")}.md`;
      }

      const parts = chapterPath.split("/");
      let currentLevel = root;

      // Navigate/create folder path
      for (let i = 0; i < parts.length - 1; i++) {
        const folderPath = parts.slice(0, i + 1).join("/");
        let folder = folderMap.get(folderPath);

        if (!folder) {
          folder = {
            name: parts[i],
            path: folderPath,
            type: "folder",
            children: [],
          };
          folderMap.set(folderPath, folder);
          currentLevel.push(folder);
        }
        currentLevel = folder.children!;
      }

      // Check if a file node already exists at this path (from workspace files)
      const fileName = parts[parts.length - 1];
      const existingIdx = currentLevel.findIndex(
        (n) => n.name === fileName && n.type === "file",
      );

      const chapterNode: TreeNode = {
        name: `第${ch.number}章 ${ch.title || "无标题"}`,
        path: chapterPath,
        type: "chapter",
        chapter: ch,
      };

      if (existingIdx >= 0) {
        // Replace the placeholder file node with the chapter node
        currentLevel[existingIdx] = chapterNode;
      } else {
        currentLevel.push(chapterNode);
      }
    }
  }

  return root;
}

function TreeNodeItem({
  node,
  depth,
}: {
  node: TreeNode;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const openFile = useEditorStore((s) => s.openFile);
  const hasChildren = node.children && node.children.length > 0;

  const handleClick = useCallback(() => {
    if (node.type === "folder") {
      setExpanded((v) => !v);
    } else if (node.type === "chapter" && node.chapter) {
      openFile({
        id: node.chapter.id,
        path: node.path,
        type: "chapter",
        label: `第${node.chapter.number}章 ${node.chapter.title || "无标题"}`,
        novelId: node.chapter.novelId,
      });
    } else if (node.file) {
      openFile({
        id: node.file.id,
        path: node.file.path,
        type: "workspace",
        label: node.name,
        novelId: node.file.novelId,
      });
    }
  }, [node, openFile]);

  const Icon = useMemo(() => {
    if (node.type === "folder") return expanded ? FolderOpen : Folder;
    if (node.type === "chapter") return BookOpen;
    if (node.file) return fileIcons[node.file.type] ?? FileText;
    return FileText;
  }, [node, expanded]);

  return (
    <div>
      <button
        onClick={handleClick}
        className="flex w-full items-center gap-1.5 py-1 px-2 text-left font-body text-xs text-fg-secondary transition-colors hover:bg-surface-secondary rounded-sm"
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {node.type === "folder" ? (
          expanded ? (
            <ChevronDown size={12} className="shrink-0 text-fg-muted" />
          ) : (
            <ChevronRight size={12} className="shrink-0 text-fg-muted" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <Icon
          size={14}
          className={
            node.type === "folder"
              ? "text-accent-light"
              : node.type === "chapter"
                ? "text-accent"
                : "text-fg-muted"
          }
        />
        <span className="truncate">{node.name}</span>
      </button>

      {expanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNodeItem
              key={child.path}
              node={child}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ files, chapters }: FileTreeProps) {
  const tree = useMemo(() => buildTree(files, chapters), [files, chapters]);

  if (tree.length === 0) {
    return (
      <div className="px-3 py-4 text-center">
        <Folder size={20} className="mx-auto mb-1.5 text-fg-muted" />
        <p className="font-caption text-[11px] text-fg-muted">暂无文件</p>
      </div>
    );
  }

  return (
    <div className="py-1">
      {tree.map((node) => (
        <TreeNodeItem key={node.path} node={node} depth={0} />
      ))}
    </div>
  );
}
