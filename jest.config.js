// Pin a non-UTC timezone so local-vs-UTC date handling is exercised
// deterministically (the app stores UTC timestamps but keys sessions by
// the user's local calendar date).
process.env.TZ = process.env.TZ || "America/New_York";

/** @type {import('jest').Config} */
module.exports = {
  setupFiles: ["fake-indexeddb/auto"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testEnvironment: "jsdom",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "\\.(css|less|scss|sass)$": "<rootDir>/__mocks__/styleMock.js",
  },
  transform: {
    "^.+\\.(ts|tsx|js)$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/**/*.d.ts"],
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/.worktrees/",
    "<rootDir>/.claude/",
    "<rootDir>/e2e/",
  ],
};
