/**
 * Fictia 主题。颜色以空格分隔 RGB，供 Tailwind `rgb(var(--x) / <alpha>)` 使用。
 */

export type ThemeId =
  | "mo-ye"
  | "parchment"
  | "qing-kong"
  | "qing-ci"
  | "bo-he"
  | "ying-shi"
  | "song-yan"
  | "rose-night"
  | "deep-sea"
  | "neon-study"
  | "custom";

export interface ThemeDef {
  id: ThemeId;
  name: string;
  en: string;
  description: string;
  swatch: string[];
  mode: "dark" | "light";
  vars: Record<string, string>;
}

export interface CustomColors {
  /** 主色：按钮 / 高亮 */
  accent: string;
  /** 辅色：渐变终点 / 危险/粉调 */
  secondary: string;
  /** 点缀：成功/青调 / 头像渐变 */
  tertiary: string;
  mode: "dark" | "light";
}

export const CUSTOM_STORAGE_KEY = "fictia.theme.custom";
export const DEFAULT_THEME: ThemeId = "mo-ye";
export const THEME_STORAGE_KEY = "fictia.theme";

export const DEFAULT_CUSTOM: CustomColors = {
  accent: "#3B82F6",
  secondary: "#A855F7",
  tertiary: "#10B981",
  mode: "dark",
};

// —— 颜色工具 ——————————————————————————————————————

export function hexToRgbTriplet(hex: string): string {
  const h = hex.replace("#", "").trim();
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.slice(0, 6);
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return "255 174 78";
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export function tripletToHex(triplet: string): string {
  const [r, g, b] = triplet.split(/[\s]+/).map((x) => parseInt(x, 10) || 0);
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0"))
      .join("")
  );
}

function parseTriplet(triplet: string): [number, number, number] {
  const [r, g, b] = triplet.split(/\s+/).map((x) => parseInt(x, 10) || 0);
  return [r, g, b];
}

function mixTriplet(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parseTriplet(a);
  const [r2, g2, b2] = parseTriplet(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `${m(r1, r2)} ${m(g1, g2)} ${m(b1, b2)}`;
}

function lighten(triplet: string, t: number): string {
  return mixTriplet(triplet, "255 255 255", t);
}

function darken(triplet: string, t: number): string {
  return mixTriplet(triplet, "0 0 0", t);
}

function luminance(triplet: string): number {
  const [r, g, b] = parseTriplet(triplet);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function pickInk(accent: string): string {
  return luminance(accent) > 0.55 ? "18 16 22" : "250 250 248";
}

// —— 预置主题 ——————————————————————————————————————

export const THEMES: ThemeDef[] = [
  {
    id: "mo-ye",
    name: "墨夜",
    en: "Mo Ye",
    description: "深色基底 · 琥珀主色",
    swatch: ["#101014", "#FFAE4E", "#F87A93"],
    mode: "dark",
    vars: {
      "--c-bg": "16 16 20",
      "--c-surface": "23 22 28",
      "--c-card": "30 29 36",
      "--c-elevated": "38 36 46",
      "--c-muted": "38 36 46",
      "--c-inset": "19 18 24",
      "--c-ink": "10 9 12",
      "--c-stroke": "42 40 51",
      "--c-stroke-strong": "59 57 70",
      "--c-text": "244 242 238",
      "--c-text-2": "176 172 184",
      "--c-muted-fg": "120 116 128",
      "--c-accent": "255 174 78",
      "--c-accent-deep": "232 149 58",
      "--c-accent-light": "255 192 110",
      "--c-accent-ink": "20 19 26",
      "--c-rose": "248 122 147",
      "--c-violet": "180 156 255",
      "--c-cyan": "94 217 232",
      "--c-success": "87 217 163",
      "--c-blue": "110 168 255",
      "--c-selection": "rgb(255 174 78 / 0.28)",
      "--c-scroll": "59 57 70",
      "--c-scroll-hover": "90 86 104",
      "--font-display": "'Space Grotesk', 'Inter', system-ui, sans-serif",
      "--grad-brand-a": "#FFAE4E",
      "--grad-brand-b": "#F87A93",
      "--grad-avatar-a": "#B49CFF",
      "--grad-avatar-b": "#5ED9E8",
      "--grad-hero": "linear-gradient(115deg, #2A2033 0%, #1B1A22 55%, #1B1A22 100%)",
      "--shadow-panel": "0 8px 32px rgb(0 0 0 / 0.45)",
      "--shadow-card": "0 2px 12px rgb(0 0 0 / 0.28)",
    },
  },
  {
    id: "parchment",
    name: "羊皮卷",
    en: "Parchment",
    description: "暖光纸感 · 衬线标题",
    swatch: ["#F5F2E9", "#7D6B3D", "#C46D00"],
    mode: "light",
    vars: {
      "--c-bg": "245 242 233",
      "--c-surface": "252 250 244",
      "--c-card": "255 255 255",
      "--c-elevated": "242 237 226",
      "--c-muted": "242 237 226",
      "--c-inset": "237 233 221",
      "--c-ink": "45 41 38",
      "--c-stroke": "220 216 203",
      "--c-stroke-strong": "196 191 175",
      "--c-text": "45 41 38",
      "--c-text-2": "94 89 84",
      "--c-muted-fg": "156 149 144",
      "--c-accent": "125 107 61",
      "--c-accent-deep": "196 109 0",
      "--c-accent-light": "168 149 95",
      "--c-accent-ink": "255 255 255",
      "--c-rose": "182 94 86",
      "--c-violet": "120 96 180",
      "--c-cyan": "74 110 138",
      "--c-success": "90 125 79",
      "--c-blue": "74 110 138",
      "--c-selection": "rgb(125 107 61 / 0.2)",
      "--c-scroll": "196 191 175",
      "--c-scroll-hover": "156 149 144",
      "--font-display": "'Newsreader', 'Georgia', serif",
      "--grad-brand-a": "#7D6B3D",
      "--grad-brand-b": "#C46D00",
      "--grad-avatar-a": "#7F9470",
      "--grad-avatar-b": "#7D6B3D",
      "--grad-hero": "linear-gradient(115deg, #F0EBD8 0%, #E8D9BE 100%)",
      "--shadow-panel": "0 12px 40px rgb(45 41 38 / 0.16)",
      "--shadow-card": "0 1px 8px rgb(45 41 38 / 0.08)",
    },
  },
  {
    id: "qing-kong",
    name: "晴空",
    en: "Qing Kong",
    description: "浅云白 · 天青主色",
    swatch: ["#F3F7FB", "#2F80ED", "#F2C94C"],
    mode: "light",
    vars: {
      "--c-bg": "243 247 251",
      "--c-surface": "250 252 255",
      "--c-card": "255 255 255",
      "--c-elevated": "232 239 247",
      "--c-muted": "232 239 247",
      "--c-inset": "228 236 245",
      "--c-ink": "15 23 42",
      "--c-stroke": "210 220 232",
      "--c-stroke-strong": "175 190 210",
      "--c-text": "15 23 42",
      "--c-text-2": "71 85 105",
      "--c-muted-fg": "130 145 165",
      "--c-accent": "47 128 237",
      "--c-accent-deep": "30 100 200",
      "--c-accent-light": "100 160 255",
      "--c-accent-ink": "255 255 255",
      "--c-rose": "235 87 87",
      "--c-violet": "120 96 200",
      "--c-cyan": "0 150 170",
      "--c-success": "33 150 110",
      "--c-blue": "47 128 237",
      "--c-selection": "rgb(47 128 237 / 0.18)",
      "--c-scroll": "175 190 210",
      "--c-scroll-hover": "140 155 175",
      "--font-display": "'Space Grotesk', 'Inter', system-ui, sans-serif",
      "--grad-brand-a": "#2F80ED",
      "--grad-brand-b": "#56CCF2",
      "--grad-avatar-a": "#2F80ED",
      "--grad-avatar-b": "#F2C94C",
      "--grad-hero": "linear-gradient(115deg, #E8F1FB 0%, #F7FAFD 100%)",
      "--shadow-panel": "0 12px 40px rgb(15 23 42 / 0.12)",
      "--shadow-card": "0 1px 8px rgb(15 23 42 / 0.06)",
    },
  },
  {
    id: "qing-ci",
    name: "青瓷",
    en: "Qing Ci",
    description: "米白瓷面 · 青绿主色",
    swatch: ["#F4F7F5", "#0F766E", "#D97706"],
    mode: "light",
    vars: {
      "--c-bg": "244 247 245",
      "--c-surface": "250 252 250",
      "--c-card": "255 255 255",
      "--c-elevated": "232 238 234",
      "--c-muted": "232 238 234",
      "--c-inset": "226 233 228",
      "--c-ink": "20 30 28",
      "--c-stroke": "205 216 210",
      "--c-stroke-strong": "170 185 178",
      "--c-text": "20 30 28",
      "--c-text-2": "70 85 80",
      "--c-muted-fg": "130 145 138",
      "--c-accent": "15 118 110",
      "--c-accent-deep": "13 90 85",
      "--c-accent-light": "45 150 140",
      "--c-accent-ink": "255 255 255",
      "--c-rose": "190 90 80",
      "--c-violet": "100 110 180",
      "--c-cyan": "14 140 150",
      "--c-success": "22 130 90",
      "--c-blue": "30 110 170",
      "--c-selection": "rgb(15 118 110 / 0.16)",
      "--c-scroll": "170 185 178",
      "--c-scroll-hover": "140 155 148",
      "--font-display": "'Space Grotesk', 'Inter', system-ui, sans-serif",
      "--grad-brand-a": "#0F766E",
      "--grad-brand-b": "#34D399",
      "--grad-avatar-a": "#0F766E",
      "--grad-avatar-b": "#D97706",
      "--grad-hero": "linear-gradient(115deg, #E7F2EE 0%, #F6FAF8 100%)",
      "--shadow-panel": "0 12px 40px rgb(20 30 28 / 0.12)",
      "--shadow-card": "0 1px 8px rgb(20 30 28 / 0.06)",
    },
  },
  {
    id: "bo-he",
    name: "薄荷",
    en: "Mint",
    description: "极浅灰 · 薄荷绿",
    swatch: ["#F5F7F8", "#10B981", "#6366F1"],
    mode: "light",
    vars: {
      "--c-bg": "245 247 248",
      "--c-surface": "252 253 253",
      "--c-card": "255 255 255",
      "--c-elevated": "236 240 242",
      "--c-muted": "236 240 242",
      "--c-inset": "230 235 237",
      "--c-ink": "15 20 22",
      "--c-stroke": "210 218 222",
      "--c-stroke-strong": "175 185 190",
      "--c-text": "15 20 22",
      "--c-text-2": "70 80 85",
      "--c-muted-fg": "130 140 145",
      "--c-accent": "16 185 129",
      "--c-accent-deep": "5 150 105",
      "--c-accent-light": "52 211 153",
      "--c-accent-ink": "255 255 255",
      "--c-rose": "244 63 94",
      "--c-violet": "99 102 241",
      "--c-cyan": "8 145 178",
      "--c-success": "16 185 129",
      "--c-blue": "59 130 246",
      "--c-selection": "rgb(16 185 129 / 0.18)",
      "--c-scroll": "175 185 190",
      "--c-scroll-hover": "145 155 160",
      "--font-display": "'Space Grotesk', 'Inter', system-ui, sans-serif",
      "--grad-brand-a": "#10B981",
      "--grad-brand-b": "#6EE7B7",
      "--grad-avatar-a": "#10B981",
      "--grad-avatar-b": "#6366F1",
      "--grad-hero": "linear-gradient(115deg, #E8F8F2 0%, #F7FAFB 100%)",
      "--shadow-panel": "0 12px 40px rgb(15 20 22 / 0.12)",
      "--shadow-card": "0 1px 8px rgb(15 20 22 / 0.06)",
    },
  },
  {
    id: "ying-shi",
    name: "樱时",
    en: "Sakura",
    description: "樱粉浅底 · 玫瑰主色",
    swatch: ["#FFF5F7", "#E11D48", "#7C3AED"],
    mode: "light",
    vars: {
      "--c-bg": "255 245 247",
      "--c-surface": "255 250 251",
      "--c-card": "255 255 255",
      "--c-elevated": "252 232 236",
      "--c-muted": "252 232 236",
      "--c-inset": "250 228 233",
      "--c-ink": "40 18 28",
      "--c-stroke": "240 205 215",
      "--c-stroke-strong": "220 170 185",
      "--c-text": "40 18 28",
      "--c-text-2": "100 60 75",
      "--c-muted-fg": "160 120 135",
      "--c-accent": "225 29 72",
      "--c-accent-deep": "190 20 55",
      "--c-accent-light": "244 90 130",
      "--c-accent-ink": "255 255 255",
      "--c-rose": "225 29 72",
      "--c-violet": "124 58 237",
      "--c-cyan": "8 130 160",
      "--c-success": "22 140 100",
      "--c-blue": "79 70 229",
      "--c-selection": "rgb(225 29 72 / 0.16)",
      "--c-scroll": "220 170 185",
      "--c-scroll-hover": "190 140 155",
      "--font-display": "'Space Grotesk', 'Inter', system-ui, sans-serif",
      "--grad-brand-a": "#E11D48",
      "--grad-brand-b": "#FB7185",
      "--grad-avatar-a": "#E11D48",
      "--grad-avatar-b": "#7C3AED",
      "--grad-hero": "linear-gradient(115deg, #FFE4EA 0%, #FFF7F9 100%)",
      "--shadow-panel": "0 12px 40px rgb(40 18 28 / 0.12)",
      "--shadow-card": "0 1px 8px rgb(40 18 28 / 0.06)",
    },
  },
  {
    id: "song-yan",
    name: "松烟",
    en: "Song Yan",
    description: "松烟墨绿 · 山野静气",
    swatch: ["#0E1412", "#6ECF8A", "#C9A227"],
    mode: "dark",
    vars: {
      "--c-bg": "14 20 18",
      "--c-surface": "18 26 23",
      "--c-card": "26 36 32",
      "--c-elevated": "34 46 40",
      "--c-muted": "34 46 40",
      "--c-inset": "12 17 15",
      "--c-ink": "6 10 9",
      "--c-stroke": "36 50 44",
      "--c-stroke-strong": "52 70 62",
      "--c-text": "232 240 235",
      "--c-text-2": "168 186 176",
      "--c-muted-fg": "110 128 118",
      "--c-accent": "110 207 138",
      "--c-accent-deep": "78 172 110",
      "--c-accent-light": "140 224 164",
      "--c-accent-ink": "10 18 14",
      "--c-rose": "232 140 130",
      "--c-violet": "168 190 220",
      "--c-cyan": "94 196 190",
      "--c-success": "110 207 138",
      "--c-blue": "120 170 200",
      "--c-selection": "rgb(110 207 138 / 0.28)",
      "--c-scroll": "52 70 62",
      "--c-scroll-hover": "78 100 90",
      "--font-display": "'Space Grotesk', 'Inter', system-ui, sans-serif",
      "--grad-brand-a": "#6ECF8A",
      "--grad-brand-b": "#C9A227",
      "--grad-avatar-a": "#6ECF8A",
      "--grad-avatar-b": "#5ED9E8",
      "--grad-hero": "linear-gradient(115deg, #1A2E24 0%, #14201C 60%)",
      "--shadow-panel": "0 8px 32px rgb(0 0 0 / 0.4)",
      "--shadow-card": "0 2px 12px rgb(0 0 0 / 0.24)",
    },
  },
  {
    id: "rose-night",
    name: "蔷薇夜",
    en: "Rose Night",
    description: "深紫底 · 蔷薇主色",
    swatch: ["#140F18", "#F07A9A", "#D4A0FF"],
    mode: "dark",
    vars: {
      "--c-bg": "20 15 24",
      "--c-surface": "27 20 32",
      "--c-card": "36 28 42",
      "--c-elevated": "48 38 56",
      "--c-muted": "48 38 56",
      "--c-inset": "16 12 20",
      "--c-ink": "10 7 12",
      "--c-stroke": "52 40 62",
      "--c-stroke-strong": "72 56 86",
      "--c-text": "246 240 246",
      "--c-text-2": "190 176 198",
      "--c-muted-fg": "130 116 140",
      "--c-accent": "240 122 154",
      "--c-accent-deep": "210 90 128",
      "--c-accent-light": "250 156 180",
      "--c-accent-ink": "24 14 20",
      "--c-rose": "240 122 154",
      "--c-violet": "212 160 255",
      "--c-cyan": "130 210 230",
      "--c-success": "130 210 160",
      "--c-blue": "150 170 255",
      "--c-selection": "rgb(240 122 154 / 0.28)",
      "--c-scroll": "72 56 86",
      "--c-scroll-hover": "100 80 118",
      "--font-display": "'Space Grotesk', 'Inter', system-ui, sans-serif",
      "--grad-brand-a": "#F07A9A",
      "--grad-brand-b": "#D4A0FF",
      "--grad-avatar-a": "#D4A0FF",
      "--grad-avatar-b": "#F07A9A",
      "--grad-hero": "linear-gradient(115deg, #2E1B30 0%, #1B1422 60%)",
      "--shadow-panel": "0 8px 32px rgb(0 0 0 / 0.45)",
      "--shadow-card": "0 2px 12px rgb(0 0 0 / 0.28)",
    },
  },
  {
    id: "deep-sea",
    name: "深海",
    en: "Deep Sea",
    description: "靛蓝深海 · 冷光青",
    swatch: ["#0A1220", "#5EB8FF", "#3DE0C8"],
    mode: "dark",
    vars: {
      "--c-bg": "10 18 32",
      "--c-surface": "14 24 40",
      "--c-card": "20 32 50",
      "--c-elevated": "28 42 64",
      "--c-muted": "28 42 64",
      "--c-inset": "8 14 24",
      "--c-ink": "4 8 14",
      "--c-stroke": "32 48 72",
      "--c-stroke-strong": "48 68 96",
      "--c-text": "230 240 250",
      "--c-text-2": "160 180 200",
      "--c-muted-fg": "100 120 145",
      "--c-accent": "94 184 255",
      "--c-accent-deep": "56 150 220",
      "--c-accent-light": "140 210 255",
      "--c-accent-ink": "8 16 28",
      "--c-rose": "255 130 150",
      "--c-violet": "160 170 255",
      "--c-cyan": "61 224 200",
      "--c-success": "70 210 170",
      "--c-blue": "94 184 255",
      "--c-selection": "rgb(94 184 255 / 0.28)",
      "--c-scroll": "48 68 96",
      "--c-scroll-hover": "70 95 130",
      "--font-display": "'Space Grotesk', 'Inter', system-ui, sans-serif",
      "--grad-brand-a": "#5EB8FF",
      "--grad-brand-b": "#3DE0C8",
      "--grad-avatar-a": "#5EB8FF",
      "--grad-avatar-b": "#B49CFF",
      "--grad-hero": "linear-gradient(115deg, #0F2840 0%, #0C1828 60%)",
      "--shadow-panel": "0 8px 32px rgb(0 0 0 / 0.45)",
      "--shadow-card": "0 2px 12px rgb(0 0 0 / 0.28)",
    },
  },
  {
    id: "neon-study",
    name: "霓虹书房",
    en: "Neon Study",
    description: "近黑底 · 霓虹双色",
    swatch: ["#0C0A14", "#C77DFF", "#00E5C0"],
    mode: "dark",
    vars: {
      "--c-bg": "12 10 20",
      "--c-surface": "18 15 28",
      "--c-card": "26 22 38",
      "--c-elevated": "36 30 52",
      "--c-muted": "36 30 52",
      "--c-inset": "10 8 16",
      "--c-ink": "6 4 10",
      "--c-stroke": "46 38 68",
      "--c-stroke-strong": "68 56 96",
      "--c-text": "244 240 250",
      "--c-text-2": "180 170 200",
      "--c-muted-fg": "120 110 140",
      "--c-accent": "199 125 255",
      "--c-accent-deep": "170 90 230",
      "--c-accent-light": "220 170 255",
      "--c-accent-ink": "16 10 22",
      "--c-rose": "255 100 140",
      "--c-violet": "199 125 255",
      "--c-cyan": "0 229 192",
      "--c-success": "0 229 192",
      "--c-blue": "120 160 255",
      "--c-selection": "rgb(199 125 255 / 0.3)",
      "--c-scroll": "68 56 96",
      "--c-scroll-hover": "95 80 130",
      "--font-display": "'Space Grotesk', 'Inter', system-ui, sans-serif",
      "--grad-brand-a": "#C77DFF",
      "--grad-brand-b": "#00E5C0",
      "--grad-avatar-a": "#C77DFF",
      "--grad-avatar-b": "#00E5C0",
      "--grad-hero": "linear-gradient(115deg, #2A1840 0%, #141020 60%)",
      "--shadow-panel": "0 8px 32px rgb(0 0 0 / 0.5)",
      "--shadow-card": "0 2px 12px rgb(0 0 0 / 0.3)",
    },
  },
];

/** 用三色生成完整主题（自定义） */
export function buildCustomTheme(c: CustomColors): ThemeDef {
  const accent = hexToRgbTriplet(c.accent);
  const secondary = hexToRgbTriplet(c.secondary);
  const tertiary = hexToRgbTriplet(c.tertiary);
  const light = c.mode === "light";
  const ink = pickInk(accent);

  const bg = light ? "246 247 250" : "14 14 18";
  const surface = light ? "252 252 254" : "20 20 26";
  const card = light ? "255 255 255" : "28 28 36";
  const elevated = light ? "235 237 242" : "38 38 48";
  const inset = light ? "230 232 238" : "16 16 22";
  const inkBg = light ? "30 30 36" : "6 6 10";
  const stroke = light ? "210 212 220" : "42 42 52";
  const strokeStrong = light ? "175 178 188" : "60 60 72";
  const text = light ? "28 28 34" : "242 242 246";
  const text2 = light ? "90 92 100" : "170 172 182";
  const mutedFg = light ? "140 142 150" : "118 118 130";
  const scroll = light ? "175 178 188" : "60 60 72";
  const scrollHover = light ? "140 142 150" : "90 90 104";

  return {
    id: "custom",
    name: "自定义",
    en: "Custom",
    description: "三色自定义 · 即时预览",
    swatch: [c.accent, c.secondary, c.tertiary],
    mode: c.mode,
    vars: {
      "--c-bg": bg,
      "--c-surface": surface,
      "--c-card": card,
      "--c-elevated": elevated,
      "--c-muted": elevated,
      "--c-inset": inset,
      "--c-ink": inkBg,
      "--c-stroke": stroke,
      "--c-stroke-strong": strokeStrong,
      "--c-text": text,
      "--c-text-2": text2,
      "--c-muted-fg": mutedFg,
      "--c-accent": accent,
      "--c-accent-deep": darken(accent, 0.18),
      "--c-accent-light": lighten(accent, 0.18),
      "--c-accent-ink": ink,
      "--c-rose": secondary,
      "--c-violet": mixTriplet(secondary, tertiary, 0.5),
      "--c-cyan": tertiary,
      "--c-success": tertiary,
      "--c-blue": mixTriplet(accent, "#6EA8FF", 0.55),
      "--c-selection": `rgb(${accent} / 0.22)`,
      "--c-scroll": scroll,
      "--c-scroll-hover": scrollHover,
      "--font-display": "'Space Grotesk', 'Inter', system-ui, sans-serif",
      "--grad-brand-a": c.accent,
      "--grad-brand-b": c.secondary,
      "--grad-avatar-a": c.tertiary,
      "--grad-avatar-b": c.secondary,
      "--grad-hero": light
        ? `linear-gradient(115deg, rgb(${lighten(accent, 0.82)}) 0%, rgb(${lighten(secondary, 0.88)}) 100%)`
        : `linear-gradient(115deg, rgb(${darken(accent, 0.72)}) 0%, rgb(${darken(secondary, 0.8)}) 100%)`,
      "--shadow-panel": light
        ? "0 12px 40px rgb(20 20 28 / 0.14)"
        : "0 8px 32px rgb(0 0 0 / 0.45)",
      "--shadow-card": light
        ? "0 1px 8px rgb(20 20 28 / 0.06)"
        : "0 2px 12px rgb(0 0 0 / 0.28)",
    },
  };
}

export function readStoredCustom(): CustomColors {
  try {
    const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CustomColors>;
      return {
        accent: parsed.accent || DEFAULT_CUSTOM.accent,
        secondary: parsed.secondary || DEFAULT_CUSTOM.secondary,
        tertiary: parsed.tertiary || DEFAULT_CUSTOM.tertiary,
        mode: parsed.mode === "light" ? "light" : "dark",
      };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_CUSTOM };
}

export function getTheme(id: string | null | undefined, custom?: CustomColors): ThemeDef {
  if (id === "custom") return buildCustomTheme(custom ?? readStoredCustom());
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function applyTheme(id: ThemeId, custom?: CustomColors): void {
  const theme = getTheme(id, custom);
  const root = document.documentElement;
  root.dataset.theme = theme.id === "custom" ? "custom" : theme.id;
  root.dataset.themeMode = theme.mode;
  root.style.colorScheme = theme.mode;
  Object.entries(theme.vars).forEach(([k, v]) => {
    root.style.setProperty(k, v);
  });
  updateFavicon(theme);
  root.dispatchEvent(
    new CustomEvent("fictia:themechange", { detail: { id: theme.id, mode: theme.mode } }),
  );
}

function updateFavicon(theme: ThemeDef): void {
  const a = theme.vars["--grad-brand-a"];
  const b = theme.vars["--grad-brand-b"];
  const ink = theme.vars["--c-accent-ink"];
  const inkColor = ink ? `rgb(${ink})` : "#14131A";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${a}"/>
      <stop offset="100%" stop-color="${b}"/>
    </linearGradient>
  </defs>
  <rect x="1" y="1" width="30" height="30" rx="8" fill="url(#g)"/>
  <g transform="translate(7.5 7.5) scale(0.72)" fill="none" stroke="${inkColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/>
    <line x1="16" y1="8" x2="2" y2="22"/>
    <line x1="17.5" y1="15" x2="9" y2="15"/>
  </g>
</svg>`;
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/svg+xml";
  link.href = url;
}
