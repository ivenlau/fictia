import { useEffect, useState } from "react";
import { Sparkles, FlaskConical, X, Wand2 } from "lucide-react";
import type { CustomToolDef, CustomToolKind, JsonSchema, ToolTier } from "@fictia/shared";
import { customToolsApi } from "../../api/custom-tools";
import { ModelSelector } from "../common/ModelSelector";
import { useSettingsStore } from "@/stores/settingsStore";

/** 常用内置系统工具（前端写死一个有用子集；完整清单在服务端 AGENT_TOOL_MAP）。 */
const BUILTIN_TOOLS = [
  "read_file", "write_file", "edit_file", "list_files", "count_words",
  "get_character", "get_summary_chain", "get_chapter_summary", "get_foreshadow",
  "semantic_search", "get_craft_doc", "search_entities", "get_entity",
  "validate_style", "scan_consistency",
];

/** 按工具的 parameters JSON Schema 生成示例入参（让测试开箱即用，避免空入参导致「无法获取参数内容」）。 */
function sampleParamsFromSchema(parameters: JsonSchema | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const props = (parameters?.properties ?? {}) as Record<string, { type?: string; description?: string }>;
  for (const [key, schema] of Object.entries(props)) {
    const t = schema?.type;
    if (t === "string") out[key] = schema?.description ? `示例：${schema.description}` : "示例文本";
    else if (t === "integer" || t === "number") out[key] = 0;
    else if (t === "boolean") out[key] = false;
    else out[key] = null;
  }
  return out;
}

const inputCls =
  "w-full rounded-md border border-subtle bg-surface-muted px-2.5 py-1.5 font-caption text-xs text-fg-primary focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20";
const labelCls = "block mb-1 font-caption text-[11px] font-medium text-fg-secondary";

function emptyDef(): CustomToolDef {
  return {
    id: "",
    name: "",
    label: "",
    description: "",
    tier: "readonly",
    parameters: { type: "object", properties: {} },
    kind: { kind: "llm", systemPrompt: "", inputTemplate: "", model: undefined },
    enabled: true,
    createdAt: "",
    updatedAt: "",
  };
}

export function CustomToolEditorModal({
  initial,
  novelId,
  onClose,
  onSaved,
}: {
  initial: CustomToolDef | null;
  novelId: string;
  onClose: () => void;
  onSaved: (def: CustomToolDef) => void;
}) {
  const [def, setDef] = useState<CustomToolDef>(initial ?? emptyDef());
  const [paramsText, setParamsText] = useState(JSON.stringify(def.parameters, null, 2));
  const [busy, setBusy] = useState(false);
  const [testParams, setTestParams] = useState(() => JSON.stringify(sampleParamsFromSchema(def.parameters), null, 2));
  const [testResult, setTestResult] = useState<string>("");
  const [genDesc, setGenDesc] = useState("");
  const [error, setError] = useState<string>("");
  const providers = useSettingsStore((s) => s.providers);
  const usable = providers.filter((p) => p.enabled && p.models.some((m) => m.enabled));
  const [customTools, setCustomTools] = useState<CustomToolDef[]>([]);
  useEffect(() => {
    customToolsApi.list().then(setCustomTools).catch(() => {});
  }, []);

  const setKind = (k: CustomToolKind) => setDef((d) => ({ ...d, kind: k }));
  const patch = (p: Partial<CustomToolDef>) => setDef((d) => ({ ...d, ...p }));

  /** llm 子代理可调工具的多选切换（内置系统工具 + 其他自定义工具）。 */
  const toggleLlmTool = (name: string) => {
    if (def.kind.kind !== "llm") return;
    const cur = def.kind.tools ?? [];
    setKind({ ...def.kind, tools: cur.includes(name) ? cur.filter((t) => t !== name) : [...cur, name] });
  };

  const onGenerate = async () => {
    if (!genDesc.trim()) return;
    setBusy(true);
    setError("");
    try {
      const generated = await customToolsApi.generate(genDesc.trim());
      setDef(generated);
      setParamsText(JSON.stringify(generated.parameters, null, 2));
      setTestParams(JSON.stringify(sampleParamsFromSchema(generated.parameters), null, 2));
      setGenDesc("");
    } catch (e: any) {
      setError(e?.message ?? "生成失败");
    } finally {
      setBusy(false);
    }
  };

  const onTest = async () => {
    setBusy(true);
    setError("");
    setTestResult("");
    try {
      const params = JSON.parse(testParams || "{}");
      const r = await customToolsApi.testDef(novelId, { ...def, enabled: true }, params);
      setTestResult(r.ok ? `✓ ${(r.output ?? "").slice(0, 600)}${r.durationMs ? `  (${r.durationMs}ms)` : ""}` : `✗ ${r.error ?? "失败"}`);
    } catch (e: any) {
      setTestResult(`✗ ${e?.message ?? "测试失败（检查 params 是否合法 JSON）"}`);
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    setBusy(true);
    setError("");
    try {
      const parameters = JSON.parse(paramsText || "{}");
      const payload = { ...def, parameters };
      const saved = initial
        ? await customToolsApi.update(initial.id, payload)
        : await customToolsApi.create(payload);
      onSaved(saved);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "保存失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-[680px] max-h-[88vh] overflow-y-auto rounded-lg border border-subtle bg-surface-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-heading text-base font-semibold text-fg-primary">
            {initial ? "编辑工具" : "新建工具"}
          </h3>
          <button onClick={onClose} className="text-fg-muted hover:text-fg-primary">
            <X size={18} />
          </button>
        </div>

        {/* AI 生成 */}
        <div className="mb-4 rounded-md border border-accent/30 bg-accent-bg/40 p-3">
          <div className="mb-1.5 flex items-center gap-1.5 font-caption text-[11px] font-medium text-accent">
            <Sparkles size={12} /> AI 生成（自然语言描述 → 工具）
          </div>
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder="例如：一个分析章节文字情绪倾向的工具"
              value={genDesc}
              onChange={(e) => setGenDesc(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onGenerate()}
            />
            <button
              onClick={onGenerate}
              disabled={busy || !genDesc.trim()}
              className="shrink-0 rounded-md bg-accent px-3 py-1.5 font-caption text-[11px] font-medium text-accent-ink hover:bg-accent-light disabled:opacity-40"
            >
              生成
            </button>
          </div>
        </div>

        {/* 通用字段 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>工具名 (lower_snake_case)</label>
            <input className={inputCls} value={def.name} onChange={(e) => patch({ name: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>显示名</label>
            <input className={inputCls} value={def.label} onChange={(e) => patch({ label: e.target.value })} />
          </div>
        </div>
        <div className="mt-3">
          <label className={labelCls}>描述（给 AI 看的工具说明）</label>
          <textarea className={inputCls} rows={2} value={def.description} onChange={(e) => patch({ description: e.target.value })} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>权限 tier</label>
            <select className={inputCls} value={def.tier} onChange={(e) => patch({ tier: e.target.value as ToolTier })}>
              <option value="readonly">readonly（只读）</option>
              <option value="write">write（写文件）</option>
              <option value="orchestrate">orchestrate（编排）</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>启用</label>
            <select className={inputCls} value={def.enabled ? "1" : "0"} onChange={(e) => patch({ enabled: e.target.value === "1" })}>
              <option value="1">启用</option>
              <option value="0">禁用</option>
            </select>
          </div>
        </div>

        {/* kind 切换 */}
        <div className="mt-4">
          <label className={labelCls}>执行种类</label>
          <div className="flex gap-2">
            {(["llm", "http", "js"] as const).map((k) => (
              <button
                key={k}
                onClick={() => {
                  if (k === "llm") setKind({ kind: "llm", systemPrompt: "", inputTemplate: "" });
                  if (k === "http") setKind({ kind: "http", method: "GET", urlTemplate: "" });
                  if (k === "js") setKind({ kind: "js", code: "" });
                }}
                className={`rounded-md px-3 py-1 font-caption text-[11px] font-medium ${
                  def.kind.kind === k ? "bg-accent text-accent-ink" : "bg-surface-muted text-fg-secondary hover:bg-surface-secondary"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        {/* kind 字段 */}
        <div className="mt-3 rounded-md border border-subtle bg-surface-muted/50 p-3">
          {def.kind.kind === "llm" && (
            <div className="space-y-2">
              <div>
                <label className={labelCls}>系统提示词</label>
                <textarea
                  className={inputCls}
                  rows={3}
                  value={def.kind.systemPrompt}
                  onChange={(e) => setKind({ ...(def.kind as any),systemPrompt: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>输入模板（支持 {`{{参数名}}`} 插值）</label>
                <textarea
                  className={inputCls}
                  rows={2}
                  value={def.kind.inputTemplate}
                  onChange={(e) => setKind({ ...(def.kind as any),inputTemplate: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>模型（可选，留空用系统默认）</label>
                <ModelSelector
                  value={def.kind.model ?? { providerId: "", modelId: "" }}
                  providers={providers}
                  usable={usable}
                  onChangeProvider={(pid) => {
                    const mid = providers.find((p) => p.id === pid)?.models.find((m) => m.enabled)?.id ?? "";
                    setKind({ ...(def.kind as any),model: { providerId: pid, modelId: mid } });
                  }}
                  onChangeModel={(mid) => (def.kind as any).model && setKind({ ...(def.kind as any), model: { ...(def.kind as any).model, modelId: mid } })}
                />
                {def.kind.model && (
                  <button onClick={() => setKind({ ...(def.kind as any),model: undefined })} className="mt-1 font-caption text-[10px] text-fg-muted underline">
                    清除（用系统默认）
                  </button>
                )}
              </div>
              <div>
                <label className={labelCls}>
                  可调工具（选了即变 agentic 子 agent，可多轮多工具调用；不选=单次调用）
                </label>
                <div className="max-h-36 overflow-y-auto rounded border border-subtle bg-surface-muted/40 p-2">
                  <div className="mb-1 font-caption text-[10px] text-fg-muted">内置系统工具</div>
                  <div className="flex flex-wrap gap-1">
                    {BUILTIN_TOOLS.map((t) => {
                      const on = ((def.kind as any).tools ?? []).includes(t);
                      return (
                        <button key={t} onClick={() => toggleLlmTool(t)} type="button"
                          className={`rounded px-1.5 py-0.5 font-caption text-[10px] ${on ? "bg-accent text-accent-ink" : "bg-surface-card text-fg-secondary hover:bg-surface-secondary"}`}>
                          {t}
                        </button>
                      );
                    })}
                  </div>
                  {customTools.filter((t) => t.enabled && t.name !== def.name).length > 0 && (
                    <>
                      <div className="mb-1 mt-2 font-caption text-[10px] text-fg-muted">其他自定义工具</div>
                      <div className="flex flex-wrap gap-1">
                        {customTools.filter((t) => t.enabled && t.name !== def.name).map((t) => {
                          const on = ((def.kind as any).tools ?? []).includes(t.name);
                          return (
                            <button key={t.id} onClick={() => toggleLlmTool(t.name)} type="button"
                              className={`rounded px-1.5 py-0.5 font-caption text-[10px] ${on ? "bg-accent text-accent-ink" : "bg-surface-card text-fg-secondary hover:bg-surface-secondary"}`}>
                              {t.name}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
                <p className="mt-1 font-caption text-[10px] text-fg-muted">
                  递归防护：同名工具 ≤3 层、总嵌套 ≤12 层，超出自动中止。
                </p>
              </div>
            </div>
          )}
          {def.kind.kind === "http" && (
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className={labelCls}>方法</label>
                  <select
                    className={inputCls}
                    value={def.kind.method}
                    onChange={(e) => setKind({ ...(def.kind as any),method: e.target.value as any })}
                  >
                    {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-3">
                  <label className={labelCls}>URL 模板（{`{{参数}}`} 插值）</label>
                  <input className={inputCls} value={def.kind.urlTemplate} onChange={(e) => setKind({ ...(def.kind as any),urlTemplate: e.target.value })} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Headers（JSON）</label>
                <input
                  className={inputCls}
                  value={JSON.stringify(def.kind.headers ?? {})}
                  onChange={(e) => {
                    try { setKind({ ...(def.kind as any),headers: JSON.parse(e.target.value || "{}") }); } catch { /* 编辑中 */ }
                  }}
                />
              </div>
              <div>
                <label className={labelCls}>Body 模板（可选，JSON 字符串）</label>
                <input className={inputCls} value={def.kind.bodyTemplate ?? ""} onChange={(e) => setKind({ ...(def.kind as any),bodyTemplate: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>响应提取（jsonpath 如 data.result，或 /正则/，留空取全文）</label>
                <input className={inputCls} value={def.kind.responseExtract ?? ""} onChange={(e) => setKind({ ...(def.kind as any),responseExtract: e.target.value })} />
              </div>
            </div>
          )}
          {def.kind.kind === "js" && (
            <div className="space-y-2">
              <label className={labelCls}>
                JS 代码（注入 params/novelId/novelDir/helpers；helpers: readFile/writeFile/listFiles/fetch；须 return {`{ content: [{type:"text", text:"..."}] }`})
              </label>
              <textarea
                className={`${inputCls} font-mono`}
                rows={8}
                value={def.kind.code}
                onChange={(e) => setKind({ ...(def.kind as any),code: e.target.value })}
              />
            </div>
          )}
        </div>

        {/* parameters JSON Schema */}
        <div className="mt-3">
          <label className={labelCls}>参数 JSON Schema</label>
          <textarea className={`${inputCls} font-mono`} rows={5} value={paramsText} onChange={(e) => setParamsText(e.target.value)} />
        </div>

        {/* 测试 */}
        <div className="mt-3 rounded-md border border-subtle p-3">
          <div className="mb-1.5 flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 font-caption text-[11px] font-medium text-fg-secondary">
              <FlaskConical size={12} /> 测试入参（已按 parameters 自动填示例，可改成真实内容后测）
            </div>
            <button
              onClick={() => setTestParams(JSON.stringify(sampleParamsFromSchema(def.parameters), null, 2))}
              className="flex items-center gap-1 rounded text-[10px] text-accent hover:underline"
              title="按当前 parameters 重新生成示例入参"
            >
              <Wand2 size={10} /> 填示例
            </button>
          </div>
          <div className="flex gap-2">
            <textarea
              className={`${inputCls} font-mono`}
              rows={3}
              value={testParams}
              onChange={(e) => setTestParams(e.target.value)}
            />
            <button onClick={onTest} disabled={busy} className="shrink-0 rounded-md bg-surface-secondary px-3 py-1.5 font-caption text-[11px] font-medium text-fg-primary hover:bg-surface-primary disabled:opacity-40">
              测试
            </button>
          </div>
          {testResult && <pre className="mt-2 whitespace-pre-wrap font-caption text-[11px] text-fg-secondary">{testResult}</pre>}
        </div>

        {error && <p className="mt-3 font-caption text-[11px] text-error">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 font-caption text-xs text-fg-secondary hover:bg-surface-secondary">
            取消
          </button>
          <button onClick={onSave} disabled={busy} className="rounded-md bg-accent px-4 py-1.5 font-caption text-xs font-medium text-accent-ink hover:bg-accent-light disabled:opacity-40">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
