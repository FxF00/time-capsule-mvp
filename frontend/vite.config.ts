import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Load env vars from .env file
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    define: {
      // Needed for ethers.js BrowserProvider
      "process.env": {},
    },
    resolve: {
      // Ensure proper module resolution
    },
  };
});
