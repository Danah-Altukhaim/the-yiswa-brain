import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pair: {
          DEFAULT: "#6AABEC",
          hover: "#5A9ADB",
          light: "rgba(106, 171, 236, 0.08)",
          glow: "rgba(106, 171, 236, 0.15)",
          muted: "rgba(106, 171, 236, 0.5)",
        },
        surface: {
          primary: "#FFFFFF",
          secondary: "#F5F5F7",
          tertiary: "#FAFAFA",
          elevated: "#FFFFFF",
        },
        apple: {
          text: "#1D1D1F",
          secondary: "#86868B",
          tertiary: "#AEAEB2",
          separator: "rgba(0, 0, 0, 0.06)",
          "separator-light": "rgba(0, 0, 0, 0.04)",
          red: "#FF3B30",
          orange: "#FF9500",
          yellow: "#FFCC00",
          green: "#34C759",
          blue: "#007AFF",
          purple: "#AF52DE",
        },
        status: {
          open: "#007AFF",
          progress: "#AF52DE",
          resolved: "#34C759",
          closed: "#8E8E93",
        },
        priority: {
          critical: "#FF3B30",
          high: "#FF9500",
          medium: "#FFCC00",
          low: "#8E8E93",
        },
      },
      fontFamily: {
        sans: ['"SF Pro Text"', "-apple-system", "BlinkMacSystemFont", "system-ui", '"Segoe UI"', "Roboto", "sans-serif"],
        display: ['"SF Pro Display"', '"SF Pro Text"', "-apple-system", "system-ui", "sans-serif"],
        arabic: ["Almarai", "sans-serif"],
      },
      borderRadius: {
        apple: "12px",
        "apple-lg": "16px",
        "apple-xl": "20px",
      },
      boxShadow: {
        "apple-sm": "0 1px 2px rgba(0, 0, 0, 0.04)",
        apple: "0 2px 8px rgba(0, 0, 0, 0.06), 0 0 1px rgba(0, 0, 0, 0.04)",
        "apple-md": "0 4px 16px rgba(0, 0, 0, 0.07), 0 0 1px rgba(0, 0, 0, 0.04)",
        "apple-lg": "0 8px 30px rgba(0, 0, 0, 0.08), 0 0 1px rgba(0, 0, 0, 0.04)",
        "apple-xl": "0 20px 60px rgba(0, 0, 0, 0.1), 0 0 1px rgba(0, 0, 0, 0.06)",
      },
    },
  },
  plugins: [],
} satisfies Config;
