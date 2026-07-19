/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0a",
        surface: "#141414",
        "surface-2": "#1f1f1f",
        accent: {
          DEFAULT: "#14b8a6",
          hover: "#0d9488",
          soft: "rgba(20,184,166,0.12)",
        },
        muted: "#9ca3af",
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: { xl: "1rem", "2xl": "1.25rem" },
      boxShadow: {
        card: "0 8px 30px rgba(0,0,0,0.5)",
        glow: "0 0 0 2px #14b8a6, 0 0 24px rgba(20,184,166,0.35)",
      },
      keyframes: {
        "fade-in": { from: { opacity: 0 }, to: { opacity: 1 } },
        "row-in": { from: { opacity: 0, transform: "translateY(8px)" }, to: { opacity: 1, transform: "translateY(0)" } },
      },
      animation: {
        "fade-in": "fade-in .4s ease both",
        "row-in": "row-in .5s ease both",
      },
    },
  },
  plugins: [],
};
