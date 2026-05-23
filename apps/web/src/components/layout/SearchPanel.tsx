import { useState, useCallback, useRef, useEffect } from "react";
import { Search, FileText, BookOpen, Loader2 } from "lucide-react";
import { novelsApi } from "@/api/novels";
import { useEditorStore } from "@/stores/editorStore";
import { useUIStore } from "@/stores/uiStore";
import type { SearchResult } from "@/api/novels";

export function SearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openFile = useEditorStore((s) => s.openFile);
  const explorerWidth = useUIStore((s) => s.explorerWidth);
  const setExplorerWidth = useUIStore((s) => s.setExplorerWidth);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startWidth: explorerWidth };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = ev.clientX - dragRef.current.startX;
        setExplorerWidth(dragRef.current.startWidth + delta);
      };

      const handleMouseUp = () => {
        dragRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [explorerWidth, setExplorerWidth],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const data = await novelsApi.search(q.trim());
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(value), 300);
    },
    [doSearch],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        doSearch(query);
      }
    },
    [query, doSearch],
  );

  const handleResultClick = useCallback(
    (result: SearchResult) => {
      if (result.type === "chapter") {
        openFile({
          id: result.id,
          path: `${result.novelTitle}/${result.path}.md`,
          type: "chapter",
          label: `${result.novelTitle}/${result.title}`,
          novelId: result.novelId,
          novelTitle: result.novelTitle,
        });
      } else {
        openFile({
          id: result.id,
          path: result.path,
          type: "workspace",
          label: `${result.novelTitle}/${result.title}`,
          novelId: result.novelId,
          novelTitle: result.novelTitle,
        });
      }
    },
    [openFile],
  );

  const highlightMatch = (text: string, q: string) => {
    if (!q.trim()) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-accent-bg text-accent rounded-sm px-0.5">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div className="flex flex-col h-full relative">
      {/* Search input */}
      <div className="px-3 pt-3 pb-2">
        <p className="font-caption text-[11px] font-semibold uppercase tracking-wider text-fg-muted mb-2">
          SEARCH
        </p>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索所有文件和章节..."
            className="w-full rounded-md border border-subtle bg-surface-card pl-8 pr-3 py-1.5 font-body text-xs text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
          />
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-fg-muted">
            <Loader2 size={14} className="animate-spin" />
            <span className="font-caption text-xs">搜索中...</span>
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="py-6 text-center">
            <p className="font-caption text-xs text-fg-muted">未找到匹配结果</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="space-y-0.5">
            <p className="font-caption text-[10px] text-fg-muted px-2 py-1">
              {results.length} 个结果
            </p>
            {results.map((result) => (
              <button
                key={`${result.type}-${result.id}`}
                onClick={() => handleResultClick(result)}
                className="w-full text-left rounded px-2 py-2 hover:bg-surface-muted/50 transition-colors group"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {result.type === "chapter" ? (
                    <BookOpen size={12} className="text-accent shrink-0" />
                  ) : (
                    <FileText size={12} className="text-fg-muted shrink-0" />
                  )}
                  <span className="font-caption text-xs text-fg-primary truncate">
                    {highlightMatch(result.title, query)}
                  </span>
                </div>
                <p className="font-caption text-[10px] text-fg-muted truncate pl-[18px]">
                  {result.novelTitle} / {result.path}
                </p>
                <p className="font-caption text-[11px] text-fg-secondary mt-1 pl-[18px] line-clamp-2 leading-relaxed">
                  {highlightMatch(result.snippet, query)}
                </p>
              </button>
            ))}
          </div>
        )}

        {!searched && (
          <div className="py-6 text-center">
            <Search size={20} className="mx-auto mb-1.5 text-fg-muted/40" />
            <p className="font-caption text-[11px] text-fg-muted">
              输入关键词搜索所有内容
            </p>
          </div>
        )}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent/30 transition-colors z-10"
      />
    </div>
  );
}
