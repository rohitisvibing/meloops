import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // YouTube embeds must be able to identify the embedding site (Required Minimum
  // Functionality; missing Referer causes player error 153).
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }] }];
  },
};

export default nextConfig;
