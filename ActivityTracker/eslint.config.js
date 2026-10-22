import js from "@eslint/js";
import globals from "globals";
export default [
  { ignores: ["node_modules", "dist", "config.js"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
];
