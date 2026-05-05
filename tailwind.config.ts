import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: "#0b0c10",
        paper: "#fafaf7",
        accent: "#7c3aed",
      },
    },
  },
  plugins: [],
};

export default config;
