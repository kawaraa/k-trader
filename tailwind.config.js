/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        pc: "#aea1ea", // Primary Color
        // bf: "#9aa0a6", // Border focus color

        // red: "#ff6446",
        // green: "#14d263",
        // blue: "#4696ff",
        // orange: "#ffa500",
        // blur: "#00000066",
      },
      zIndex: {
        auto: "auto",
        0: "0",
        1: "1",
        2: "2",
        3: "3",
        4: "4",
        5: "5",
        6: "6",
        7: "7",
        8: "8",
        9: "9",
        10: "10",
      },
      future: {
        hoverOnlyWhenSupported: true,
      },
    },
  },
  plugins: [],
};
