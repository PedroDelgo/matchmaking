module.exports = {
  preset: "jest-expo",
  testMatch: ["**/tests/**/*.test.[jt]s?(x)"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  clearMocks: true,
  collectCoverageFrom: ["src/features/tournaments/engine/**/*.ts"],
};
