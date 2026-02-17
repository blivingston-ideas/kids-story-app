import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./hooks/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#FF9F1C",
        secondary: "#2EC4B6",
        accent: "#FFBF69",
        softAccent: "#CBF3F0",
        anchor: "#293241",
        appBg: "#F6FCFB",
        cardBg: "#FFFFFF",
        storyBg: "#FFF8F0",
      },
      borderRadius: {
        card: "16px",
      },
      boxShadow: {
        card: "0 10px 24px -20px rgba(41, 50, 65, 0.35)",
      },
    },
  },
};

export default config;
