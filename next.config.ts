import type { NextConfig } from "next";

// Standalone is only for the Tauri desktop bundle (self-hosted Node server).
// Vercel must use the default output — standalone breaks its NFT tracing.
const isDesktopBuild = process.env.DESKTOP_BUILD === "1";

const nextConfig: NextConfig = {
  reactCompiler: true,
  ...(isDesktopBuild
    ? {
        output: "standalone" as const,
        outputFileTracingExcludes: {
          "*": [
            "./src-tauri/**/*",
            "./scripts/**/*",
            "./frontend/**/*",
          ],
        },
      }
    : {}),
};

export default nextConfig;
