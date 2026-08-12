import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Standalone server is bundled into the Tauri desktop app (sidecar).
  output: "standalone",
  outputFileTracingExcludes: {
    "*": [
      "./src-tauri/**/*",
      "./scripts/**/*",
      "./frontend/**/*",
    ],
  },
};

export default nextConfig;
