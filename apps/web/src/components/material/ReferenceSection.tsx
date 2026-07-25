import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  BookMarked,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Upload,
} from "lucide-react";
import {
  referencesApi,
  type ParseStatus,
  type ReferenceMeta,
  type ReferenceWork,
  type SourceFormat,
} from "@/api/references";

const STATUS_LABEL: Record<ParseStatus, string> = {
  pending: "待解析",
  parsing: "解析中",
  done: "已解析",
  failed: "解析失败",
};
const STATUS_COLOR: Record<ParseStatus, string> = {
  pending: "text-fg-muted bg-surface-secondary",
  parsing: "text-accent bg-accent/10",
  done: "text-success bg-success/10",
  failed: "text-error bg-error/10",
};
const FORMAT_LABEL: Record<SourceFormat, string> = {
  paste: "粘贴",
  txt: "txt",
  markdown: "md",
  epub: "epub",
};

const KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const MAX_CHARS = 2_000_000;

interface Outputs {
  fingerprint: string;
  genreCard: string;
  craft: string;
}

/** EPUB(zip) → 纯文本：解压后取所有 xhtml/html，去标签按文件名顺序拼接。 */
async function parseEpubToText(file: File): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter(
    (e) => !e.dir && /\.(x?html?|htm)$/i.test(e.name),
  );
  entries.sort((a, b) => a.name.localeCompare(b.name, "zh"));
  const texts: string[] = [];
  for (const e of entries) {
    const html = await e.async("text");
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<\/(p|div|br|h[1-6]|li|tr|blockquote)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (text) texts.push(text);
  }
  return texts.join("\n\n");
}

function OutputBlock({
  title,
  content,
  loading,
  action,
}: {
  title: string;
  content: string;
  loading: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex items-center justify-between">
        <span className="font-caption text-[10px] font-semibold text-fg-secondary">{title}</span>
        {action}
      </div>
      {loading ? (
        <div className="flex items-center gap-1 text-fg-muted mt-0.5">
          <Loader2 size={10} className="animate-spin" />
          <span className="font-caption text-[10px]">加载…</span>
        </div>
      ) : content ? (
        <pre className="font-body text-[10px] leading-relaxed text-fg-secondary whitespace-pre-wrap bg-surface-secondary border border-subtle rounded-md px-2 py-1.5 max-h-56 overflow-y-auto mt-0.5">
          {content}
        </pre>
      ) : (
        <p className="font-caption text-[10px] text-fg-muted mt-0.5">（无）</p>
      )}
    </div>
  );
}

/**
 * 对标 tab：上传参考作品 → 后端同步解析为三类素材（风格指纹/体裁卡/技法）→
 * 启用注入。列表 + 折叠新建表单（粘贴/上传 txt/md/epub）+ 启停/重解析/删除 +
 * 三类产出预览 + 体裁卡「采用为本作卡」。
 */
export function ReferenceSection({ novelId }: { novelId: string }) {
  const [items, setItems] = useState<ReferenceMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [newFormat, setNewFormat] = useState<SourceFormat>("paste");
  const [newText, setNewText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<Record<string, Outputs>>({});
  const [loadingOutput, setLoadingOutput] = useState<Record<string, boolean>>({});
  const [reparsing, setReparsing] = useState<string | null>(null);
  const [adopting, setAdopting] = useState<string | null>(null);
  const [parsingFile, setParsingFile] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await referencesApi.list(novelId);
      setItems(res.entries);
    } catch (err: any) {
      setError(err?.message ?? "加载失败");
    } finally {
      setLoading(false);
    }
  }, [novelId]);

  useEffect(() => {
    void load();
  }, [load]);

  const fillOutputs = (key: string, work: ReferenceWork) => {
    setOutputs((o) => ({
      ...o,
      [key]: {
        fingerprint: work.fingerprint ?? "",
        genreCard: work.genreCard ?? "",
        craft: work.craft ?? "",
      },
    }));
  };

  const resetForm = () => {
    setNewKey("");
    setNewName("");
    setNewFormat("paste");
    setNewText("");
    setFormError(null);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const base = file.name.replace(/\.(txt|md|markdown|epub)$/i, "");
    const slug =
      base.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "reference";
    if (/\.epub$/i.test(file.name)) {
      setParsingFile(true);
      setFormError(null);
      try {
        const text = await parseEpubToText(file);
        if (!text.trim()) {
          setFormError("EPUB 解析后无文本内容");
          return;
        }
        setNewText(text);
        setNewKey((k) => k || slug);
        setNewName((n) => n || base);
        setNewFormat("epub");
      } catch (err: any) {
        setFormError("EPUB 解析失败：" + (err?.message ?? "未知错误"));
      } finally {
        setParsingFile(false);
      }
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setNewText(text);
      setNewKey((k) => k || slug);
      setNewName((n) => n || base);
      setNewFormat(/\.md$/i.test(file.name) ? "markdown" : "txt");
    };
    reader.readAsText(file);
  };

  const submit = async () => {
    setFormError(null);
    if (!KEY_RE.test(newKey)) {
      setFormError("key 须以字母/数字开头，仅含字母数字、下划线、连字符");
      return;
    }
    if (!newText.trim()) {
      setFormError("请粘贴参考作品文本，或上传 txt/md/epub 文件");
      return;
    }
    if (newText.length > MAX_CHARS) {
      setFormError(`文本过大（${(newText.length / 1_000_000).toFixed(1)}MB > 2MB），请截取后再试`);
      return;
    }
    setSubmitting(true);
    try {
      await referencesApi.create(novelId, {
        key: newKey,
        name: newName || newKey,
        sourceText: newText,
        sourceFormat: newFormat,
      });
      resetForm();
      setShowForm(false);
      void load();
    } catch (err: any) {
      setFormError(err?.message ?? "解析失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = async (m: ReferenceMeta) => {
    try {
      await referencesApi.update(novelId, m.key, { enabled: !m.enabled });
      void load();
    } catch (err: any) {
      setError(err?.message ?? "切换失败");
    }
  };

  const remove = async (m: ReferenceMeta) => {
    if (!confirm(`删除参考作品「${m.name}」？`)) return;
    try {
      await referencesApi.remove(novelId, m.key);
      if (expanded === m.key) setExpanded(null);
      void load();
    } catch (err: any) {
      setError(err?.message ?? "删除失败");
    }
  };

  const reparse = async (m: ReferenceMeta) => {
    setReparsing(m.key);
    setError(null);
    try {
      const res = await referencesApi.reparse(novelId, m.key);
      fillOutputs(m.key, res.work);
      void load();
    } catch (err: any) {
      setError(err?.message ?? "重新解析失败");
    } finally {
      setReparsing(null);
    }
  };

  const adopt = async (m: ReferenceMeta) => {
    setAdopting(m.key);
    setError(null);
    try {
      await referencesApi.adoptGenre(novelId, m.key);
      alert(`已采用《${m.name}》的体裁卡为本作自定义体裁卡。\n请在「体裁卡」tab 中选择启用。`);
    } catch (err: any) {
      setError(err?.message ?? "采用失败");
    } finally {
      setAdopting(null);
    }
  };

  const toggleExpand = async (m: ReferenceMeta) => {
    if (expanded === m.key) {
      setExpanded(null);
      return;
    }
    setExpanded(m.key);
    if (m.parseStatus === "done" && outputs[m.key] === undefined) {
      setLoadingOutput((s) => ({ ...s, [m.key]: true }));
      try {
        const w = await referencesApi.get(novelId, m.key);
        fillOutputs(m.key, w);
      } catch {
        setOutputs((o) => ({
          ...o,
          [m.key]: { fingerprint: "", genreCard: "", craft: "" },
        }));
      } finally {
        setLoadingOutput((s) => ({ ...s, [m.key]: false }));
      }
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2 border-b border-subtle">
        <p className="font-body text-xs font-medium text-fg-primary">对标作品（风格指纹 / 体裁卡 / 技法）</p>
        <p className="font-caption text-[10px] text-fg-muted mt-0.5">
          上传参考作品，自动提炼文风规律、体裁打法与技法；启用后注入相应段。只借鉴规律，不复制原文。
        </p>
      </div>

      <div className="px-3 py-2 border-b border-subtle">
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 font-body text-[11px] text-accent hover:underline"
          >
            <Plus size={12} /> 添加参考作品
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="key（英文标识，如 fanshen）"
                className="font-body text-[11px] bg-surface-secondary border border-subtle rounded-md px-2 py-1 text-fg-primary focus:outline-none focus:border-accent flex-1 min-w-0"
              />
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="显示名（如《翻身之夜》）"
                className="font-body text-[11px] bg-surface-secondary border border-subtle rounded-md px-2 py-1 text-fg-primary focus:outline-none focus:border-accent flex-1 min-w-0"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={parsingFile}
                className="flex items-center gap-1 font-body text-[11px] px-2 py-1 rounded-md border border-subtle text-fg-secondary hover:bg-surface-secondary disabled:opacity-40"
              >
                {parsingFile ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                上传 txt/md/epub
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.markdown,.epub,text/plain,application/epub+zip"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
              <span className="font-caption text-[10px] text-fg-muted">
                或粘贴到下方（{newText.length.toLocaleString()} 字）
              </span>
            </div>
            <textarea
              value={newText}
              onChange={(e) => {
                setNewText(e.target.value);
                setNewFormat("paste");
              }}
              rows={8}
              placeholder={"粘贴参考作品正文（建议覆盖开头、转折、高潮、结尾若干段，便于提炼文风）"}
              className="font-body text-[11px] leading-relaxed bg-surface-secondary border border-subtle rounded-md px-2 py-1.5 text-fg-primary focus:outline-none focus:border-accent resize-y min-h-[140px]"
            />
            {formError && <p className="font-body text-[11px] text-error">{formError}</p>}
            <div className="flex items-center gap-2">
              <button
                onClick={submit}
                disabled={submitting}
                className="flex items-center gap-1.5 font-body text-[11px] px-3 py-1.5 rounded-md bg-accent text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {submitting ? <Loader2 size={12} className="animate-spin" /> : <BookMarked size={12} />}
                {submitting ? "解析中（约 1-2 分钟）…" : "提交并解析"}
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                disabled={submitting}
                className="font-body text-[11px] text-fg-muted hover:text-fg-primary"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-fg-muted">
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : error ? (
        <div className="px-3 py-2 text-xs text-error">{error}</div>
      ) : items.length === 0 ? (
        <p className="px-3 py-3 font-caption text-[10px] text-fg-muted">
          暂无参考作品，点击上方「添加参考作品」。
        </p>
      ) : (
        <div className="px-2 py-2 flex flex-col gap-1">
          {items.map((m) => {
            const isOpen = expanded === m.key;
            const isReparsing = reparsing === m.key;
            const out = outputs[m.key];
            return (
              <div
                key={m.key}
                className="group rounded-md border border-subtle px-2.5 py-1.5 hover:bg-surface-secondary transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => toggleExpand(m)}
                    className="flex items-center gap-1 min-w-0 flex-1 text-left"
                  >
                    {isOpen ? (
                      <ChevronDown size={12} className="text-fg-muted shrink-0" />
                    ) : (
                      <ChevronRight size={12} className="text-fg-muted shrink-0" />
                    )}
                    <span
                      className={`font-body text-xs font-medium truncate ${
                        m.enabled ? "text-fg-primary" : "text-fg-muted"
                      }`}
                    >
                      {m.name}
                    </span>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      className={`font-caption text-[10px] px-1.5 py-0.5 rounded ${
                        STATUS_COLOR[m.parseStatus]
                      }`}
                    >
                      {isReparsing ? "解析中" : STATUS_LABEL[m.parseStatus]}
                    </span>
                    <button
                      onClick={() => toggle(m)}
                      title={
                        m.parseStatus !== "done"
                          ? "需先完成解析"
                          : m.enabled
                            ? "已启用，点击禁用"
                            : "已禁用，点击启用"
                      }
                      className={
                        m.enabled && m.parseStatus === "done" ? "text-accent" : "text-fg-muted"
                      }
                      disabled={m.parseStatus !== "done"}
                    >
                      {m.enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                    </button>
                    <button
                      onClick={() => reparse(m)}
                      title="重新解析"
                      disabled={isReparsing}
                      className="text-fg-muted hover:text-fg-primary opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-40"
                    >
                      {isReparsing ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <RefreshCw size={12} />
                      )}
                    </button>
                    <button
                      onClick={() => remove(m)}
                      title="删除"
                      className="text-fg-muted hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-0.5 pl-4">
                  <span className="font-caption text-[10px] text-fg-muted">
                    {(m.charCount / 10000).toFixed(1)} 万字
                  </span>
                  <span className="font-caption text-[10px] text-fg-muted">
                    {FORMAT_LABEL[m.sourceFormat]}
                  </span>
                  {m.parsedAt && (
                    <span className="font-caption text-[10px] text-fg-muted">
                      {new Date(m.parsedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {isOpen && (
                  <div className="mt-1.5 pl-4">
                    {m.parseStatus !== "done" ? (
                      <p className="font-caption text-[10px] text-fg-muted">
                        {m.parseStatus === "failed"
                          ? "解析失败，可点击重新解析按钮重试。"
                          : "尚未解析完成。"}
                      </p>
                    ) : (
                      <>
                        <OutputBlock
                          title="风格指纹"
                          content={out?.fingerprint ?? ""}
                          loading={!!loadingOutput[m.key]}
                        />
                        <OutputBlock
                          title="体裁卡"
                          content={out?.genreCard ?? ""}
                          loading={!!loadingOutput[m.key]}
                          action={
                            out?.genreCard ? (
                              <button
                                onClick={() => adopt(m)}
                                disabled={adopting === m.key}
                                title="采用为本作体裁卡"
                                className="flex items-center gap-1 font-caption text-[10px] text-accent hover:underline disabled:opacity-40"
                              >
                                {adopting === m.key ? (
                                  <Loader2 size={10} className="animate-spin" />
                                ) : (
                                  <BookMarked size={10} />
                                )}
                                采用为本作卡
                              </button>
                            ) : undefined
                          }
                        />
                        <OutputBlock
                          title="技法"
                          content={out?.craft ?? ""}
                          loading={!!loadingOutput[m.key]}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
