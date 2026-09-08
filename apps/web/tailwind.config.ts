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
        "ink-cursor": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        "status-glow": {
          "0%": { boxShadow: "0 0 0 0 rgb(var(--c-accent) / 0.45)" },
          "70%": { boxShadow: "0 0 0 8px rgb(var(--c-accent) / 0)" },
          "100%": { boxShadow: "0 0 0 0 rgb(var(--c-accent) / 0)" },
        },
        "success-burst": {
          "0%": { opacity: "0.7", transform: "scale(0.6)" },
          "100%": { opacity: "0", transform: "scale(2.2)" },
        },
        "success-sweep": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        stamp: {
          "0%": { opacity: "0", transform: "scale(1.2) rotate(-8deg)", filter: "blur(2px)" },
          "60%": { opacity: "1", transform: "scale(0.98) rotate(-3deg)", filter: "blur(0)" },
          "100%": { opacity: "1", transform: "scale(1) rotate(-3deg)", filter: "blur(0)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-2px)" },
          "75%": { transform: "translateX(2px)" },
        },
        "ink-write": {
          "0%": { width: "0%" },
          "100%": { width: "var(--ink-progress, 0%)" },
        },
        "fly-in": {
          "0%": { opacity: "0", transform: "scale(0.4)" },
          "20%": { opacity: "1", transform: "scale(1)" },
          "100%": { opacity: "0", transform: "scale(0.6) translateY(-24px)" },
        },
        "pen-absorb": {
          "0%": { opacity: "1", transform: "scaleY(1)" },
          "100%": { opacity: "0", transform: "scaleY(0.2)" },
        },
        "text-illuminate": {
          "0%": { backgroundColor: "rgb(var(--c-accent) / 0.22)" },
          "100%": { backgroundColor: "transparent" },
        },
        "panel-swap": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "modal-backdrop": {
          from: { opacity: "0", backdropFilter: "blur(0px)" },
          to: { opacity: "1", backdropFilter: "blur(3px)" },
        },
        "float-soft": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-3px)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.18s ease-out both",
        "fade-in-up": "fade-in-up 0.24s cubic-bezier(0.22,1,0.36,1) both",
        "scale-in": "scale-in 0.2s cubic-bezier(0.22,1,0.36,1) both",
        "pulse-soft": "pulse-soft 1.6s ease-in-out infinite",
        shimmer: "shimmer 1.8s linear infinite",
        "ink-cursor": "ink-cursor 1s ease-in-out infinite",
        "status-glow": "status-glow 1.4s ease-out infinite",
        "success-burst": "success-burst 0.55s ease-out both",
        "success-sweep": "success-sweep 0.45s ease-out both",
        stamp: "stamp 0.28s cubic-bezier(0.22,1,0.36,1) both",
        shake: "shake 0.16s ease-in-out both",
        "ink-write": "ink-write 0.8s cubic-bezier(0.22,1,0.36,1) both",
        "fly-in": "fly-in 0.32s cubic-bezier(0.22,1,0.36,1) both",
        "pen-absorb": "pen-absorb 0.28s ease-in both",
        "text-illuminate": "text-illuminate 0.45s ease-out both",
        "panel-swap": "panel-swap 0.22s cubic-bezier(0.22,1,0.36,1) both",
        "modal-backdrop": "modal-backdrop 0.2s ease-out both",
        "float-soft": "float-soft 4s ease-in-out infinite",
        "pending-breathe": "pulse-soft 2.8s ease-in-out infinite",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.22, 1, 0.36, 1)",
        "in-out-expo": "cubic-bezier(0.87, 0, 0.13, 1)",
      },
      transitionDuration: {
        fast: "140ms",
        base: "220ms",
        slow: "360ms",
      },
      scale: {
        press: "0.96",
      },
    },
  },
  plugins: [],
};

export default config;
