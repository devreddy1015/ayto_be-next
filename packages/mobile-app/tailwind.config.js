/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.tsx",
    "./index.ts",
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "bg-primary": "#0A0A0F",
        "bg-surface": "#13131A",
        "bg-elevated": "#1C1C27",
        "accent-green": "#00FF87",
        "accent-amber": "#FFB300",
        "accent-blue": "#4A9EFF",
        "accent-coral": "#FF6B6B",
        "text-primary": "#FFFFFF",
        "text-secondary": "#8E8EA0",
        border: "rgba(255,255,255,0.08)",
      },
      fontFamily: {
        heading: ["Inter-Bold", "sans-serif"],
        body: ["Inter-Regular", "sans-serif"],
        mono: ["JetBrainsMono-Regular", "monospace"],
      },
      borderRadius: {
        card: "16px",
        "card-lg": "20px",
        pill: "9999px",
      },
      spacing: {
        xs: "4px",
        sm: "8px",
        md: "16px",
        lg: "24px",
        xl: "32px",
        "2xl": "48px",
      },
    },
  },
  plugins: [],
}
