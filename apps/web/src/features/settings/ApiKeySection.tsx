import { useState, useCallback } from "react";
import { Eye, EyeOff, Plug, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { settingsApi } from "@/api/settings";
import { PROVIDER_LABELS } from "@fictia/shared";

type Provider = "glm" | "minimax" | "doubao";

interface ProviderCard {
  key: Provider;
  storeKey: "apiKeyGlm" | "apiKeyMinimax" | "apiKeyDoubao";
}

const providers: ProviderCard[] = [
  { key: "glm", storeKey: "apiKeyGlm" },
  { key: "minimax", storeKey: "apiKeyMinimax" },
  { key: "doubao", storeKey: "apiKeyDoubao" },
];

export function ApiKeySection() {
  const settingsStore = useSettingsStore();
  const [showKeys, setShowKeys] = useState<Record<Provider, boolean>>({
    glm: false,
    minimax: false,
    doubao: false,
  });
  const [testStatus, setTestStatus] = useState<
    Record<Provider, "idle" | "testing" | "ok" | "fail">
  >({
    glm: "idle",
    minimax: "idle",
    doubao: "idle",
  });

  const handleToggleShow = useCallback((provider: Provider) => {
    setShowKeys((prev) => ({ ...prev, [provider]: !prev[provider] }));
  }, []);

  const handleChange = useCallback(
    (provider: Provider, value: string) => {
      settingsStore.setApiKey(provider, value);
      setTestStatus((prev) => ({ ...prev, [provider]: "idle" }));
    },
    [settingsStore],
  );

  const handleFocus = useCallback((provider: Provider) => {
    setShowKeys((prev) => ({ ...prev, [provider]: true }));
  }, []);

  const storeKeyMap: Record<Provider, "apiKeyGlm" | "apiKeyMinimax" | "apiKeyDoubao"> = {
    glm: "apiKeyGlm",
    minimax: "apiKeyMinimax",
    doubao: "apiKeyDoubao",
  };

  const handleTest = useCallback(async (provider: Provider) => {
    const key = settingsStore[storeKeyMap[provider]];
    setTestStatus((prev) => ({ ...prev, [provider]: "testing" }));
    try {
      const result = await settingsApi.testConnection(provider, key);
      setTestStatus((prev) => ({
        ...prev,
        [provider]: result.ok ? "ok" : "fail",
      }));
    } catch {
      setTestStatus((prev) => ({ ...prev, [provider]: "fail" }));
    }
  }, [settingsStore]);

  const maskKey = (key: string) => {
    if (!key) return "";
    if (key.length <= 8) return "********";
    return key.slice(0, 4) + "****" + key.slice(-4);
  };

  return (
    <div>
      <div className="mb-4">
        <h3 className="font-heading text-base font-semibold text-fg-primary mb-1">
          连接与密钥
        </h3>
        <p className="font-body text-sm text-fg-secondary">
          配置 LLM 服务商的 API 密钥
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {providers.map(({ key: provider, storeKey }) => {
          const value = settingsStore[storeKey];
          const status = testStatus[provider];
          const isShowing = showKeys[provider];

          return (
            <div
              key={provider}
              className="rounded-lg border border-subtle bg-surface-card p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-body text-sm font-medium text-fg-primary">
                  {PROVIDER_LABELS[provider]}
                </h4>
                {status === "ok" && (
                  <span className="flex items-center gap-1 font-caption text-xs text-success">
                    <CheckCircle2 size={12} />
                    连接正常
                  </span>
                )}
                {status === "fail" && (
                  <span className="flex items-center gap-1 font-caption text-xs text-error">
                    <XCircle size={12} />
                    连接失败
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <div className="relative">
                  <input
                    type={isShowing ? "text" : "password"}
                    value={value}
                    onChange={(e) => handleChange(provider, e.target.value)}
                    onFocus={() => handleFocus(provider)}
                    placeholder="输入 API Key..."
                    className="w-full rounded-md border border-subtle bg-surface-muted px-3 py-2 pr-9 font-caption text-xs text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                  />
                  <button
                    onClick={() => handleToggleShow(provider)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg-primary transition-colors"
                    title={isShowing ? "隐藏" : "显示"}
                  >
                    {isShowing ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <button
                  onClick={() => handleTest(provider)}
                  disabled={!value || status === "testing"}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-subtle bg-surface-card px-3 py-2 font-caption text-xs text-fg-secondary transition-colors hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === "testing" ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Plug size={13} />
                  )}
                  测试连接
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
