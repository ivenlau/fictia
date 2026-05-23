import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#7D6B3D",
          bg: "#F0EBD8",
          deep: "#C46D00",
          ink: "#2C241D",
          light: "#A8955F",
          primary: "#FF9800",
          rose: "#B65E56",
          sage: "#7F9470",
        },
        surface: {
          primary: "#F5F2E9",
          secondary: "#EDE9DD",
          card: "#FFFFFF",
          muted: "#F2EDE2",
          inverse: "#2D2926",
          ink: "#191613",
          warm: "#E8D9BE",
        },
        fg: {
          primary: "#2D2926",
          secondary: "#5E5954",
          muted: "#9C9590",
          inverse: "#F5F2E9",
        },
        border: {
          subtle: "#DCD8CB",
          strong: "#C4BFAF",
        },
        success: "#5A7D4F",
        warning: "#B8860B",
        error: "#A0522D",
        info: "#4A6E8A",
      },
      fontFamily: {
        heading: ['"Newsreader"', "serif"],
        body: ['"Geist"', "sans-serif"],
        caption: ['"IBM Plex Mono"', "monospace"],
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "12px",
      },
      spacing: {
        "4.5": "18px",
      },
    },
  },
  plugins: [],
};

export default config;
