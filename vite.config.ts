import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  // Uncomment and set to your GitHub repo name if deploying to username.github.io/reponame:
  // base: "/trainer-app/",
});
