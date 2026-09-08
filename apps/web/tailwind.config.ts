import type { Config } from "tailwindcss";

/**
 * Fictia 主题 tokens → CSS 变量
 * 运行时通过 html[data-theme] 切换；opacity 修饰符依赖 <alpha-value>
 */
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "rgb(var(--c-accent) / <alpha-value>)",
          bg: "rgb(var(--c-accent) / 0.14)",
          deep: "rgb(var(--c-accent-deep) / <alpha-value>)",
          ink: "rgb(var(--c-accent-ink) / <alpha-value>)",
          light: "rgb(var(--c-accent-light) / <alpha-value>)",
          primary: "rgb(var(--c-accent) / <alpha-value>)",
          rose: "rgb(var(--c-rose) / <alpha-value>)",
          sage: "rgb(var(--c-success) / <alpha-value>)",
          violet: "rgb(var(--c-violet) / <alpha-value>)",
          cyan: "rgb(var(--c-cyan) / <alpha-value>)",
          blue: "rgb(var(--c-blue) / <alpha-value>)",
        },
        surface: {
          primary: "rgb(var(--c-bg) / <alpha-value>)",
          secondary: "rgb(var(--c-surface) / <alpha-value>)",
          card: "rgb(var(--c-card) / <alpha-value>)",
          muted: "rgb(var(--c-muted) / <alpha-value>)",
          elevated: "rgb(var(--c-elevated) / <alpha-value>)",
          inset: "rgb(var(--c-inset) / <alpha-value>)",
          inverse: "rgb(var(--c-text) / <alpha-value>)",
          ink: "rgb(var(--c-ink) / <alpha-value>)",
          warm: "rgb(var(--c-accent) / 0.08)",
        },
        fg: {
          primary: "rgb(var(--c-text) / <alpha-value>)",
          secondary: "rgb(var(--c-text-2) / <alpha-value>)",
          muted: "rgb(var(--c-muted-fg) / <alpha-value>)",
          inverse: "rgb(var(--c-accent-ink) / <alpha-value>)",
        },
        subtle: "rgb(var(--c-stroke) / <alpha-value>)",
        strong: "rgb(var(--c-stroke-strong) / <alpha-value>)",
        border: {
          subtle: "rgb(var(--c-stroke) / <alpha-value>)",
          strong: "rgb(var(--c-stroke-strong) / <alpha-value>)",
          DEFAULT: "rgb(var(--c-stroke) / <alpha-value>)",
        },
        success: "rgb(var(--c-success) / <alpha-value>)",
        warning: "rgb(var(--c-accent) / <alpha-value>)",
        error: "rgb(var(--c-rose) / <alpha-value>)",
        info: "rgb(var(--c-cyan) / <alpha-value>)",
        violet: "rgb(var(--c-violet) / <alpha-value>)",
        cyan: "rgb(var(--c-cyan) / <alpha-value>)",
        blue: "rgb(var(--c-blue) / <alpha-value>)",
        emerald: "rgb(var(--c-success) / <alpha-value>)",
        rose: "rgb(var(--c-rose) / <alpha-value>)",
        amber: "rgb(var(--c-accent) / <alpha-value>)",
      },
      fontFamily: {
        display: ['"Space Grotesk"', '"Inter"', "system-ui", "sans-serif"],
        heading: ['"Space Grotesk"', '"Inter"', "system-ui", "sans-serif"],
        body: ['"Inter"', "system-ui", "-apple-system", "PingFang SC", "Microsoft YaHei", "sans-serif"],
        caption: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "14px",
        "2xl": "16px",
      },
      spacing: {
        "4.5": "18px",
      },
      boxShadow: {
        panel: "0 8px 32px rgb(var(--c-ink) / 0.45)",
        card: "0 2px 12px rgb(var(--c-ink) / 0.28)",
        glow: "0 0 0 1px rgb(var(--c-accent) / 0.35), 0 0 20px rgb(var(--c-accent) / 0.12)",
        "glow-rose": "0 0 0 1px rgb(var(--c-rose) / 0.35), 0 0 20px rgb(var(--c-rose) / 0.12)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.18s ease-out both",
        "fade-in-up": "fade-in-up 0.24s cubic-bezier(0.22,1,0.36,1) both",
        "scale-in": "scale-in 0.2s cubic-bezier(0.22,1,0.36,1) both",
        "pulse-soft": "pulse-soft 1.6s ease-in-out infinite",
        shimmer: "shimmer 1.8s linear infinite",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
