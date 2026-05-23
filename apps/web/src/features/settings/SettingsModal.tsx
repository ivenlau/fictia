import { useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { useUIStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { settingsApi } from "@/api/settings";
import { ApiKeySection } from "./ApiKeySection";
import { AgentModelSection } from "./AgentModelSection";

export function SettingsModal() {
  const setShowSettings = useUIStore((s) => s.setShowSettings);
  const settingsStore = useSettingsStore();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      await settingsApi.update({
        apiKeyGlm: settingsStore.apiKeyGlm,
        apiKeyMinimax: settingsStore.apiKeyMinimax,
        apiKeyDoubao: settingsStore.apiKeyDoubao,
        agentModels: settingsStore.agentModels,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // error handled silently
    } finally {
      setSaving(false);
    }
  }, [settingsStore]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={() => setShowSettings(false)}
    >
      <div
        className="relative flex h-[65vh] w-[1100px] max-w-[95vw] flex-col overflow-hidden rounded-xl border border-subtle bg-surface-primary shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-subtle px-5 py-3">
          <h2 className="font-heading text-base font-bold text-fg-primary">
            设置
          </h2>
          <div className="flex items-center gap-2">
            {saved && (
              <span className="font-caption text-xs text-success">已保存</span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 font-caption text-xs font-medium text-white transition-colors hover:bg-accent-deep disabled:opacity-60"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              保存
            </button>
            <button
              onClick={() => setShowSettings(false)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-secondary hover:text-fg-primary"
              aria-label="关闭"
            >
              &times;
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-5 space-y-8">
          <ApiKeySection />
          <AgentModelSection />
        </main>
      </div>
    </div>
  );
}
