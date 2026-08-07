import type { AgentModelAssignment, ProviderInfo } from "@fictia/shared";

const selectCls =
  "w-full rounded-md border border-subtle bg-surface-muted px-2.5 py-1.5 font-caption text-xs text-fg-primary focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20";

/** provider + model 双 select（从 AgentModelSection 抽出复用：流程面板/工具编辑器都用）。 */
export function ModelSelector({
  value,
  providers,
  usable,
  onChangeProvider,
  onChangeModel,
}: {
  value: AgentModelAssignment;
  providers: ProviderInfo[];
  usable: ProviderInfo[];
  onChangeProvider: (providerId: string) => void;
  onChangeModel: (modelId: string) => void;
}) {
  const provider = providers.find((p) => p.id === value.providerId);
  const models = provider?.models.filter((m) => m.enabled) ?? [];
  const providerDisabled = !!value.providerId && !usable.some((p) => p.id === value.providerId);
  return (
    <div className="rounded-lg border border-subtle bg-surface-card p-2 space-y-2">
      <select value={value.providerId} onChange={(e) => onChangeProvider(e.target.value)} className={selectCls}>
        {usable.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        {providerDisabled && (
          <option value={value.providerId}>{provider?.name ?? value.providerId}（已停用）</option>
        )}
      </select>
      <select value={value.modelId} onChange={(e) => onChangeModel(e.target.value)} className={selectCls}>
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
        {value.modelId && !models.some((m) => m.id === value.modelId) && (
          <option value={value.modelId}>{value.modelId}（已停用）</option>
        )}
      </select>
    </div>
  );
}

export { selectCls as modelSelectCls };
