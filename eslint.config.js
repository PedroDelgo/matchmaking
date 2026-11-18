const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
module.exports = defineConfig([
  expoConfig,
  { ignores: ["dist/*", ".expo/*", ".artifacts/*"] },
  {
    files: ["scripts/*.cjs"],
    languageOptions: { globals: { __dirname: "readonly" } },
  },
  {
    files: ["tests/**/*"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
    languageOptions: {
      globals: {
        jest: "readonly",
        describe: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
      },
    },
  },
]);
