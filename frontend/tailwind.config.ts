import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#071014",
        panel: "#10181f",
        panel2: "#16222b",
        line: "#263844",
        mint: "#4ade80",
        coral: "#fb7185",
        amber: "#fbbf24",
        sky: "#38bdf8"
      },
      boxShadow: {
        glow: "0 20px 60px rgba(0,0,0,0.35)"
      }
    }
  },
  plugins: []
} satisfies Config;
