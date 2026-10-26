import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  outputDir: "/tmp/trainer-production-e2e",
  use: { ...base.use, baseURL: "http://127.0.0.1:4188/trAIner/" },
  webServer: {
    command: "bun run preview --host 127.0.0.1 --port 4188 --strictPort",
    url: "http://127.0.0.1:4188/trAIner/",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
