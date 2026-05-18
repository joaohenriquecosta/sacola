// Mirrors the automanews setup (next/jest + maxWorkers 1).
// No advisory lock yet — that lands with the first migration / Postgres.
const nextJest = require("next/jest");

const createJestConfig = nextJest({
  dir: "./",
});

const jestConfig = createJestConfig({
  testEnvironment: "node",
  maxWorkers: 1,
  moduleDirectories: ["node_modules", "<rootDir>"],
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/"],
  testTimeout: 30000,
});

module.exports = jestConfig;
