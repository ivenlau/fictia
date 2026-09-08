import { useEffect, useRef } from "react";
import { Palette, Check, SlidersHorizontal } from "lucide-react";
import { THEMES, type ThemeId } from "../../styles/themes";
import { useUIStore } from "../../stores/uiStore";

export function ThemeSwitcher() {
  const theme = useUIStore((s) => s.theme);
  const open = useUIStore((s) => s.themeMenuOpen);
  const customColors = useUIStore((s) => s.customColors);
  const setTheme = useUIStore((s) => s.setTheme);
  const setCustomColors = useUIStore((s) => s.setCustomColors);
  const setMenuOpen = useUIStore((s) => s.setThemeMenuOpen);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, setMenuOpen]);

  const preset = THEMES.find((t) => t.id === theme);
  const label =
    theme === "custom" ? "自定义" : (preset?.name ?? THEMES[0].name);

  const lightThemes = THEMES.filter((t) => t.mode === "light");
  const darkThemes = THEMES.filter((t) => t.mode === "dark");

  const renderThemeItem = (t: (typeof THEMES)[number]) => {
    const active = theme === t.id;
    return (
      <button
        key={t.id}
        onClick={() => setTheme(t.id as ThemeId)}
        className={`flex w-full items-start gap-3 rounded-lg border px-2.5 py-2.5 text-left transition-colors ${
          active
            ? "border-accent/50 bg-accent/10"
            : "border-transparent hover:border-subtle hover:bg-surface-elevated"
        }`}
      >
        <div className="flex shrink-0 items-center gap-1 pt-0.5">
          {t.swatch.map((c, i) => (
            <span
              key={c + i}
              className="h-4 w-4 rounded-full border border-subtle"
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-body text-[13px] font-semibold text-fg-primary">
              {t.name}
            </span>
            <span className="font-caption text-[10px] text-fg-muted">{t.en}</span>
            {active && <Check size={12} className="text-accent" />}
          </div>
          <p className="mt-0.5 font-body text-[11px] leading-snug text-fg-muted">
            {t.description}
          </p>
        </div>
      </button>
    );
  };

  const colorField = (
    key: keyof typeof customColors,
    label: string,
  ) => {
    if (key === "mode") return null;
    const value = customColors[key];
    return (
      <label className="flex flex-1 flex-col gap-1">
        <span className="font-caption text-[10px] text-fg-muted">{label}</span>
        <div className="flex items-center gap-2 rounded-md border border-subtle bg-surface-inset px-2 py-1.5">
          <input
            type="color"
            value={value}
            onChange={(e) => {
              setCustomColors({ [key]: e.target.value });
              if (theme !== "custom") setTheme("custom");
            }}
            className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
            aria-label={label}
          />
          <span className="font-caption text-[11px] uppercase text-fg-secondary">
            {value}
          </span>
        </div>
      </label>
    );
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setMenuOpen(!open)}
        className="flex items-center gap-1.5 rounded-md border border-subtle bg-surface-card px-2.5 py-1.5 text-[12px] text-fg-secondary transition-colors hover:border-strong hover:text-fg-primary"
        title="切换主题"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Palette size={14} className="text-accent" />
        <span className="hidden max-w-[72px] truncate sm:inline">{label}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[90] mt-2 w-[320px] animate-scale-in overflow-hidden rounded-xl border border-subtle bg-surface-card shadow-theme-panel">
          <div className="border-b border-subtle px-3 py-2">
            <p className="font-display text-[12px] font-semibold text-fg-primary">主题</p>
            <p className="font-caption text-[10px] text-fg-muted">切换后立即生效并记住</p>
          </div>

          <div className="max-h-[420px] overflow-y-auto p-1.5">
            <p className="px-2 pb-1 pt-1.5 font-caption text-[10px] uppercase tracking-wider text-fg-muted">
              亮色
            </p>
            {lightThemes.map(renderThemeItem)}

            <p className="px-2 pb-1 pt-2 font-caption text-[10px] uppercase tracking-wider text-fg-muted">
              暗色
            </p>
            {darkThemes.map(renderThemeItem)}

            {/* 自定义三色 */}
            <div
              className={`mt-2 rounded-lg border p-2.5 ${
                theme === "custom"
                  ? "border-accent/50 bg-accent/5"
                  : "border-subtle bg-surface-inset/50"
              }`}
            >
              <div className="mb-2 flex items-center gap-1.5">
                <SlidersHorizontal size={13} className="text-accent" />
                <span className="font-body text-[13px] font-semibold text-fg-primary">
                  自定义三色
                </span>
                {theme === "custom" && <Check size={12} className="text-accent" />}
              </div>
              <div className="mb-2 flex gap-2">
                {colorField("accent", "主色")}
                {colorField("secondary", "辅色")}
                {colorField("tertiary", "点缀")}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex overflow-hidden rounded-md border border-subtle">
                  {(["dark", "light"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        setCustomColors({ mode: m });
                        setTheme("custom");
                      }}
                      className={`px-2.5 py-1 font-caption text-[11px] transition-colors ${
                        customColors.mode === m
                          ? "bg-accent text-accent-ink"
                          : "text-fg-muted hover:text-fg-primary"
                      }`}
                    >
                      {m === "dark" ? "暗" : "亮"}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  {customColors.accent &&
                    [customColors.accent, customColors.secondary, customColors.tertiary].map(
                      (c) => (
                        <span
                          key={c}
                          className="h-4 w-4 rounded-full border border-subtle"
                          style={{ background: c }}
                        />
                      ),
                    )}
                </div>
                <button
                  onClick={() => setTheme("custom")}
                  className="ml-auto rounded-md bg-accent px-2.5 py-1 font-caption text-[11px] font-semibold text-accent-ink transition-colors hover:bg-accent-light"
                >
                  应用
                </button>
              </div>
              <p className="mt-1.5 font-caption text-[10px] leading-snug text-fg-muted">
                主色用于按钮与高亮，辅色用于渐变/危险，点缀用于成功与图标渐变。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
