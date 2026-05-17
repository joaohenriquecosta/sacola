// Espelha o padrão do automanews (next/jest + maxWorkers 1).
// Sem advisory lock por ora — entra junto com a primeira migration / Postgres.
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
