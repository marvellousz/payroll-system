import type { NextConfig } from "next";

// Standalone is only for the Tauri desktop bundle (self-hosted Node server).
// Vercel must use the default output — standalone breaks its NFT tracing.
const isDesktopBuild = process.env.DESKTOP_BUILD === "1";

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  ...(isDesktopBuild
    ? {
        output: "standalone" as const,
        outputFileTracingIncludes: {
          "*": [
            "./node_modules/.prisma/client/**/*",
            "./node_modules/@prisma/client/**/*",
          ],
        },
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
