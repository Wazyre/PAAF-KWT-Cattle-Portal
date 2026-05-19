import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        gov: {
          DEFAULT: "#0a6b3c",
          dark: "#075030",
          light: "#e6f2ec"
        }
      },
      fontFamily: {
        sans: ["var(--font-arabic)", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
