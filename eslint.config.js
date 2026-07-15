const globals = require("globals");

module.exports = [
  {
    files: ["script/**/*.js"],
    languageOptions: {
      ecmaVersion: 2019,
      sourceType: "commonjs",
      globals: { ...globals.es2021, g: "readonly" }
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-constant-condition": "off"
    }
  },
  {
    files: ["test/**/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "commonjs",
      globals: { ...globals.node }
    }
  }
];
