import { useState, useCallback } from "react";
import {
  FolderTree,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useUIStore } from "@/stores/uiStore";
import { useEditorStore } from "@/stores/editorStore";
import { useCreateNovel } from "@/hooks/useNovel";
import { AiGenerateButton } from "@/components/ui/AiGenerateButton";
import { FILE_TEMPLATES, AGENT_TYPE_LABELS } from "@fictia/shared";
import type { AgentType } from "@fictia/shared";

const PRE_WRITING_AGENTS: AgentType[] = [
  "genre-analyst",
  "architect",
  "style-designer",
  "art-director",
  "narrative-weaver",
];

const genreOptions = [
  "玄幻",
  "仙侠",
  "都市",
  "科幻",
  "历史",
  "言情",
  "悬疑",
  "武侠",
  "奇幻",
  "末日",
];

export function NewNovelModal() {
  const setShowNewNovel = useUIStore((s) => s.setShowNewNovel);
  const createNovel = useCreateNovel();

  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [description, setDescription] = useState("");
  const [targetChapters, setTargetChapters] = useState(20);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput("");
  }, [tagInput, tags]);

  const handleRemoveTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleGenreSelect = useCallback(
    (g: string) => {
      setGenre(g);
      if (!tags.includes(g)) {
        setTags((prev) => [...prev, g]);
      }
    },
    [tags],
  );

  const openFile = useEditorStore((s) => s.openFile);

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !genre.trim()) return;

    try {
      const novel = await createNovel.mutateAsync({
        title: title.trim(),
        genre: genre.trim(),
        description: description.trim(),
        targetChapters,
        tags,
      });
      setShowNewNovel(false);
      openFile({
        id: `overview_${novel.id}`,
        path: novel.title,
        type: "overview",
        label: novel.title,
        novelId: novel.id,
        novelTitle: novel.title,
      });
    } catch {
      // error handled silently
    }
  }, [title, genre, description, targetChapters, tags, createNovel, setShowNewNovel, openFile]);

  const isValid = title.trim().length > 0 && genre.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={() => setShowNewNovel(false)}
    >
      <div
        className="relative flex h-[70vh] w-[1100px] max-w-[95vw] flex-col overflow-hidden rounded-xl border border-subtle bg-surface-primary shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-subtle px-5 py-3">
          <h2 className="font-heading text-base font-bold text-fg-primary">
            新建小说
          </h2>
          <button
            onClick={() => setShowNewNovel(false)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-secondary hover:text-fg-primary"
            aria-label="关闭"
          >
            &times;
          </button>
        </header>

        <main className="flex-1 overflow-auto p-5 space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block font-caption text-xs text-fg-muted mb-1.5">
                小说标题 *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="输入小说标题..."
                className="w-full rounded-md border border-subtle bg-surface-card px-3 py-2 font-body text-sm text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
              />
            </div>

            <div>
              <label className="block font-caption text-xs text-fg-muted mb-1.5">
                题材类型 *
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {genreOptions.map((g) => (
                  <button
                    key={g}
                    onClick={() => handleGenreSelect(g)}
                    className={`rounded-md px-2.5 py-1 font-caption text-xs transition-colors ${
                      genre === g
                        ? "bg-accent text-white"
                        : "bg-surface-muted text-fg-secondary hover:bg-surface-secondary"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="或输入自定义题材..."
                className="w-full rounded-md border border-subtle bg-surface-card px-3 py-2 font-body text-sm text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block font-caption text-xs text-fg-muted">
                  小说简介
                </label>
                <AiGenerateButton
                  kind="novel-description"
                  fields={{
                    title,
                    genre,
                    targetChapters: String(targetChapters),
                    tags: tags.join(", "),
                  }}
                  current={description}
                  onResult={setDescription}
                  disabled={!title.trim()}
                />
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="描述你的小说故事概要..."
                rows={4}
                className="w-full resize-none rounded-md border border-subtle bg-surface-card px-3 py-2 font-body text-sm text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-caption text-xs text-fg-muted mb-1.5">
                  自定义标签
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                    placeholder="输入标签后按回车..."
                    className="flex-1 rounded-md border border-subtle bg-surface-card px-3 py-2 font-body text-sm text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                  />
                  <button
                    onClick={handleAddTag}
                    disabled={!tagInput.trim()}
                    className="rounded-md border border-subtle bg-surface-card px-3 py-2 font-caption text-xs text-fg-secondary hover:bg-surface-secondary disabled:opacity-50 transition-colors"
                  >
                    添加
                  </button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded bg-accent-bg px-2 py-0.5 font-caption text-xs text-accent"
                      >
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:text-accent-deep"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-caption text-xs text-fg-muted mb-1.5">
                  目标章节数
                </label>
                <input
                  type="number"
                  value={targetChapters}
                  onChange={(e) =>
                    setTargetChapters(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  min={1}
                  max={500}
                  className="w-32 rounded-md border border-subtle bg-surface-card px-3 py-2 font-body text-sm text-fg-primary focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                />
              </div>
            </div>
          </div>

          <div className="font-caption text-xs text-fg-muted">预览</div>

          <div className="rounded-lg border border-subtle bg-surface-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <FolderTree size={15} className="text-accent" />
              <span className="font-body text-sm font-medium text-fg-primary">
                {title || "我的小说"}/
              </span>
              <span className="font-caption text-[10px] text-fg-muted ml-auto">
                创建后将自动生成以下结构
              </span>
            </div>
            <ul className="space-y-1.5 ml-4">
              <li className="flex items-center gap-2 font-caption text-xs text-fg-secondary">
                <FolderTree size={12} className="text-accent-light" />
                前期准备/
              </li>
              {FILE_TEMPLATES.slice(0, 5).map((template) => (
                <li
                  key={template.path}
                  className="flex items-center gap-2 font-caption text-xs text-fg-muted ml-5"
                >
                  <FileText size={11} />
                  {template.path.split("/").pop()}
                </li>
              ))}
              <li className="flex items-center gap-2 font-caption text-xs text-fg-secondary">
                <FolderTree size={12} className="text-accent-light" />
                章节/
                <span className="text-[10px] text-fg-muted">
                  ({targetChapters} 章)
                </span>
              </li>
            </ul>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={!isValid || createNovel.isPending}
              className="flex items-center gap-2 rounded-md bg-accent px-6 py-2.5 font-body text-sm font-medium text-white transition-colors hover:bg-accent-deep disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createNovel.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              开始创建
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
