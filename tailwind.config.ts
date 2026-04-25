import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bone: "#f5f2ec",
        ink: "#1a1816",
        paper: "#fbf9f4",
        rust: "#b4553a",
        moss: "#5a6b4a",
        dust: "#ddd6c7",
        smoke: "#4a4742",
      },
      fontFamily: {
        display: ["Fraunces", "ui-serif", "Georgia", "serif"],
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(26,24,22,0.04), 0 2px 8px rgba(26,24,22,0.04)",
        lift: "0 2px 4px rgba(26,24,22,0.06), 0 8px 24px rgba(26,24,22,0.06)",
      },
    },
  },
  plugins: [],
};
export default config;
