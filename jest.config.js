// Pin a non-UTC timezone so local-vs-UTC date handling is exercised
// deterministically (the app stores UTC timestamps but keys sessions by
// the user's local calendar date).
process.env.TZ = process.env.TZ || "America/New_York";

/** @type {import('jest').Config} */
module.exports = {
  setupFiles: ["fake-indexeddb/auto"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  // The catalogue is ~3,200 exercises, so the RTL tests that render a whole
  // muscle section or type a query char-by-char legitimately take seconds in
  // jsdom. Under parallel CI load that overran the 5s default and failed as a
  // timeout, and a test killed mid-click leaves pending React work that fails
  // the next test too. Real hangs still fail here, just later.
  testTimeout: 30000,
  testEnvironment: "jsdom",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "\\.(css|less|scss|sass)$": "<rootDir>/__mocks__/styleMock.js",
  },
  transform: {
    "^.+\\.(ts|tsx|js)$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "scripts/**/*.ts", "!src/**/*.d.ts"],
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/.worktrees/",
    "<rootDir>/.claude/",
    "<rootDir>/e2e/",
  ],
};
