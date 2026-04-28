import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Token names preserved from prior versions so component classes still work.
        // LIGHT THEME: Linear-structure (cool grays, restrained) + Stripe-data (white cards, indigo accents)
        bone: "#fafbfc",       // page background — cool off-white (Linear-style)
        paper: "#ffffff",      // surface card — pure white (Stripe data tables)
        ink: "#0f172a",        // primary text — rich slate-black
        smoke: "#64748b",      // secondary text — neutral cool gray
        dust: "#e2e8f0",       // borders — soft cool gray, visible but understated
        rust: "#6366f1",       // primary accent — indigo (consistent with prior versions)
        moss: "#10b981",       // success — emerald
        glow: "#8b5cf6",       // accent highlight — slightly purpler indigo
        amber: "#f59e0b",      // warnings
        rose: "#ef4444",       // errors
        steel: "#f1f5f9",      // raised/hover surface — pale cool blue-gray
      },
      fontFamily: {
        display: ["Fraunces", "ui-serif", "Georgia", "serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        // Light-theme shadows are subtler — black at low opacity, no glow halos
        soft: "0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)",
        lift: "0 4px 6px -1px rgba(15, 23, 42, 0.05), 0 10px 15px -3px rgba(15, 23, 42, 0.08)",
        glow: "0 0 0 1px rgba(99, 102, 241, 0.15), 0 1px 2px rgba(99, 102, 241, 0.1)",
        "glow-cyan": "0 0 0 1px rgba(16, 185, 129, 0.15), 0 1px 2px rgba(16, 185, 129, 0.1)",
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
