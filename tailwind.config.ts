import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-dm-sans)", "sans-serif"],
        display: ["var(--font-playfair)", "serif"],
      },
      colors: {
        sidebar: "#0E1015",
        "sidebar-hover": "#1A1D24",
        "sidebar-border": "#1F2229",
        "sidebar-text": "#8B8FA8",
        "sidebar-active": "#F5A623",
        surface: "#F8F7F4",
        "surface-2": "#EFEDE8",
        accent: "#F5A623",
        "accent-dim": "#F5A62320",
      },
      borderRadius: {
        xl: "14px",
        "2xl": "20px",
      },
    },
  },
  plugins: [],
};
export default config;
