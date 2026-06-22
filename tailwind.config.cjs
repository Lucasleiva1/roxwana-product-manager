/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        rox: {
          ink: "#090d10",
          panel: "#11171b",
          line: "#263037",
          gold: "#d9a866",
          sand: "#efc78f",
        },
      },
    },
  },
  plugins: [],
};
