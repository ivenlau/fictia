import { useEffect, useMemo, useState } from "react";
import { X, Play, Loader2 } from "lucide-react";
import type { CustomToolDef, JsonSchema, WorkspaceFile } from "@fictia/shared";
import { customToolsApi } from "../../api/custom-tools";
import { novelsApi } from "../../api/novels";

const inputCls =
  "w-full rounded-md border border-subtle bg-surface-muted px-2.5 py-1.5 font-caption text-xs text-fg-primary focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20";
const labelCls = "block mb-1 font-caption text-[11px] font-medium text-fg-secondary";

type MatchType = "input" | "current" | "file";
type DocValue = "path" | "content";
interface ParamMatch {
  type: MatchType;
  value: string; // 用户输入的值
  filePath: string; // 指定文档时选的文件路径
  docValue: DocValue; // 当前文档/指定文档 时取「路径」还是「正文」
}

/** 按参数名启发式决定默认取路径还是正文：名字含 path/file/dir 默认路径，否则正文。 */
function defaultDocValue(paramName: string): DocValue {
  return /path|file|dir/i.test(paramName) ? "path" : "content";
}

function initMatchings(parameters: JsonSchema | undefined): Record<string, ParamMatch> {
  const out: Record<string, ParamMatch> = {};
  const props = (parameters?.properties ?? {}) as Record<string, unknown>;
  for (const name of Object.keys(props))
    out[name] = { type: "input", value: "", filePath: "", docValue: defaultDocValue(name) };
  return out;
}

/** 当前文档/指定文档 的取值切换：路径 or 正文。 */
function DocValueToggle({ value, onChange }: { value: DocValue; onChange: (v: DocValue) => void }) {
  return (
    <div className="flex items-center gap-1">
      <span className="font-caption text-[10px] text-fg-muted">取值：</span>
      {(["path", "content"] as const).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={`rounded px-2 py-0.5 font-caption text-[10px] ${value === k ? "bg-accent text-accent-ink" : "bg-surface-card text-fg-secondary hover:bg-surface-secondary"}`}
        >
          {k === "path" ? "路径" : "正文"}
        </button>
      ))}
    </div>
  );
}

/**
 * 运行自定义工具的参数匹配 + 结果弹窗。
 * 每个参数三种匹配：用户输入 / 当前文档（当前打开的文件正文）/ 指定文档（项目内任一文件的正文）。
 * 执行后切换到结果视图。
 */
export function RunToolDialog({
  tool,
  novelId,
  currentDocContent,
  currentDocPath,
  onClose,
}: {
  tool: CustomToolDef;
  novelId: string;
  currentDocContent: string;
  currentDocPath?: string;
  onClose: () => void;
}) {
  const params = useMemo(() => {
    const props = (tool.parameters?.properties ?? {}) as Record<string, { type?: string; description?: string }>;
    return Object.entries(props);
  }, [tool]);

  const [matchings, setMatchings] = useState<Record<string, ParamMatch>>(() => initMatchings(tool.parameters));
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; output?: string; error?: string; durationMs?: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    novelsApi.getFiles(novelId).then(setFiles).catch(() => {});
  }, [novelId]);

  const setMatch = (name: string, patch: Partial<ParamMatch>) =>
    setMatchings((m) => ({ ...m, [name]: { ...m[name], ...patch } }));

  const paramTypes = useMemo(() => {
    const props = (tool.parameters?.properties ?? {}) as Record<string, { type?: string }>;
    return props;
  }, [tool]);

  const buildParams = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [name, m] of Object.entries(matchings)) {
      if (m.type === "input") {
        out[name] = paramTypes[name]?.type === "number" ? Number(m.value) : m.value;
      } else if (m.type === "current") {
        out[name] = m.docValue === "path" ? (currentDocPath ?? "") : currentDocContent;
      } else if (m.type === "file") {
        const f = files.find((x) => x.path === m.filePath);
        out[name] = m.docValue === "path" ? (f?.path ?? "") : (f?.content ?? "");
      }
    }
    return out;
  };

  const onRun = async () => {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const r = await customToolsApi.testById(tool.id, novelId, buildParams());
      setResult(r);
    } catch (e: any) {
      setError(e?.message ?? "执行失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-[620px] max-h-[88vh] overflow-y-auto rounded-lg border border-subtle bg-surface-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-heading text-base font-semibold text-fg-primary">{tool.label || tool.name}</h3>
            <p className="font-caption text-[11px] text-fg-muted">{tool.name} · {tool.kind.kind}</p>
          </div>
          <button onClick={onClose} className="text-fg-muted hover:text-fg-primary">
            <X size={18} />
          </button>
        </div>

        {result ? (
          /* ===== 结果视图 ===== */
          <div className="space-y-3">
            <div className={`rounded-md border p-3 ${result.ok ? "border-success/40 bg-success/8" : "border-error/40 bg-error/8"}`}>
              <div className="mb-1 flex items-center gap-2 font-caption text-[11px] font-medium">
                {result.ok ? <span className="text-success">✓ 执行完成{result.durationMs ? ` · ${result.durationMs}ms` : ""}</span> : <span className="text-error">✗ 执行失败</span>}
              </div>
              <pre className="whitespace-pre-wrap break-words font-caption text-[11px] text-fg-primary max-h-72 overflow-y-auto">
                {result.ok ? result.output || "（无输出）" : result.error || "未知错误"}
              </pre>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setResult(null)} className="rounded-md px-3 py-1.5 font-caption text-xs text-fg-secondary hover:bg-surface-secondary">
                重新执行
              </button>
              <button onClick={onClose} className="rounded-md bg-accent px-4 py-1.5 font-caption text-xs font-medium text-accent-ink hover:bg-accent-light">
                关闭
              </button>
            </div>
          </div>
        ) : (
          /* ===== 参数匹配视图 ===== */
          <div className="space-y-3">
            {params.length === 0 && (
              <p className="font-caption text-[11px] text-fg-muted">该工具无入参，直接点「执行」。</p>
            )}
            {params.map(([name, schema]) => {
              const m = matchings[name];
              const required = (tool.parameters?.required ?? []).includes(name);
              return (
                <div key={name} className="rounded-md border border-subtle bg-surface-muted/40 p-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-caption text-[11px] font-medium text-fg-primary">
                      {name}
                      <span className="ml-1 text-fg-muted">({schema.type || "any"})</span>
                      {required && <span className="ml-1 text-error">*</span>}
                    </span>
                    {schema.description && <span className="font-caption text-[10px] text-fg-muted truncate ml-2">{schema.description}</span>}
                  </div>
                  <div className="mb-1.5 flex gap-1">
                    {([
                      { k: "input", label: "用户输入" },
                      { k: "current", label: "当前文档" },
                      { k: "file", label: "指定文档" },
                    ] as const).map((opt) => (
                      <button
                        key={opt.k}
                        onClick={() => setMatch(name, { type: opt.k } as Partial<ParamMatch>)}
                        className={`rounded px-2 py-0.5 font-caption text-[10px] ${m.type === opt.k ? "bg-accent text-accent-ink" : "bg-surface-card text-fg-secondary hover:bg-surface-secondary"}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {m.type === "input" && (
                    <textarea
                      className={inputCls}
                      rows={3}
                      value={m.value}
                      onChange={(e) => setMatch(name, { value: e.target.value })}
                      placeholder={schema.type === "number" ? "输入数字" : "输入文本（支持多行）"}
                    />
                  )}
                  {m.type === "current" && (
                    <div className="space-y-1.5">
                      <DocValueToggle value={m.docValue} onChange={(v) => setMatch(name, { docValue: v })} />
                      <div className="rounded border border-subtle bg-surface-card px-2 py-1 font-caption text-[10px] text-fg-secondary">
                        {m.docValue === "path"
                          ? `将传入路径：${currentDocPath ?? "（当前文档无路径）"}`
                          : `将传入正文：${currentDocPath ?? "当前文档"}（${currentDocContent.length} 字）`}
                      </div>
                    </div>
                  )}
                  {m.type === "file" && (
                    <div className="space-y-1.5">
                      <select className={inputCls} value={m.filePath} onChange={(e) => setMatch(name, { filePath: e.target.value })}>
                        <option value="">选择项目文件…</option>
                        {files.map((f) => (
                          <option key={f.path} value={f.path}>{f.path}（{f.content?.length ?? 0} 字）</option>
                        ))}
                      </select>
                      {m.filePath && <DocValueToggle value={m.docValue} onChange={(v) => setMatch(name, { docValue: v })} />}
                    </div>
                  )}
                </div>
              );
            })}

            {error && <p className="font-caption text-[11px] text-error">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="rounded-md px-3 py-1.5 font-caption text-xs text-fg-secondary hover:bg-surface-secondary">
                取消
              </button>
              <button
                onClick={onRun}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md bg-accent px-4 py-1.5 font-caption text-xs font-medium text-accent-ink hover:bg-accent-light disabled:opacity-40"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                执行
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
