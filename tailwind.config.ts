import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // COTTAGE theme — warm cream surfaces, deep forest sidebar, harvest gold accent.
        // Token names preserved from prior versions so component classes still work.
        bone: "#FAF6EE",          // page background — warm cream
        paper: "#FFFFFF",         // surface card — pure white
        ink: "#2C2C2A",           // primary text — warm dark
        smoke: "#7A7872",         // secondary text — warm gray
        dust: "#E5DECF",          // borders — warm cream-toned
        rust: "#C99A2C",          // PRIMARY ACCENT — harvest gold
        moss: "#3B6D11",          // success — deep botanical green
        glow: "#1F3A2E",          // forest — sidebar/decorative deep green
        amber: "#BA7517",         // warnings — warm amber
        rose: "#A32D2D",          // errors — muted brick red
        steel: "#F0EBE0",         // raised/hover surface — warm pale cream
        // NEW Cottage-specific tokens for the sidebar
        forest: "#1F3A2E",        // sidebar background
        "forest-text": "#E8DCC4", // sidebar default text (warm cream)
        "forest-muted": "#C9BFA6",// sidebar inactive items
        "gold-on": "#3D2E08",     // dark text for use on harvest-gold backgrounds
      },
      fontFamily: {
        display: ["Fraunces", "ui-serif", "Georgia", "serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        // Cottage — warm-tinted, low-opacity. Focus rings use harvest gold.
        soft: "0 1px 2px rgba(60, 40, 20, 0.04), 0 1px 3px rgba(60, 40, 20, 0.06)",
        lift: "0 4px 6px -1px rgba(60, 40, 20, 0.05), 0 10px 15px -3px rgba(60, 40, 20, 0.08)",
        glow: "0 0 0 1px rgba(201, 154, 44, 0.20), 0 1px 2px rgba(201, 154, 44, 0.12)",
        "glow-cyan": "0 0 0 1px rgba(59, 109, 17, 0.18), 0 1px 2px rgba(59, 109, 17, 0.10)",
      },
      animation: {
        shimmer: "shimmer 2s linear infinite",
        "pulse-glow": "pulse-glow 2.5s ease-in-out infinite",
        "fade-in": "fade-in 0.4s ease-out",
        "slide-up": "slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-1000px 0" },
          "100%": { backgroundPosition: "1000px 0" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.65" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
