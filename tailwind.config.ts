import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Deep-space UI shell the globe sits inside.
        void: "#05070d",
        hull: "#0b1020",
        panel: "#111833",
        edge: "#1e2a4d",
        // Route accents, reused by the globe arcs so 2D and 3D agree.
        route: "#38bdf8",
        routeHot: "#f0abfc",
        ink: "#e8eeff",
        inkDim: "#8ea0c9",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
