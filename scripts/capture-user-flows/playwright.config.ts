import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "capture.spec.ts",
  workers: 1,
  expect: { timeout: 15_000 },
  retries: 0,
  timeout: 180_000,
  outputDir: "/tmp/trainer-user-flow-playwright",
  reporter: "list",
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    baseURL: process.env.FLOW_BASE_URL ?? "http://127.0.0.1:4173/trAIner/",
    browserName: "chromium",
    locale: "en-US",
    timezoneId: "America/New_York",
    deviceScaleFactor: 1,
    serviceWorkers: "block",
  },
  webServer: process.env.FLOW_BASE_URL ? undefined : {
    command: "bun run preview --host 127.0.0.1 --port 4173 --strictPort",
    url: process.env.FLOW_BASE_URL ?? "http://127.0.0.1:4173/trAIner/",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
