import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Client router cache for dynamic pages: switching tabs within 30s reuses
    // the cached RSC payload instead of a full server round trip — server
    // actions still bust it via revalidatePath, so writes always show fresh.
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
};

export default nextConfig;
