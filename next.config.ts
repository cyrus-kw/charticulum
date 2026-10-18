import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Account page became the floating Settings panel; old links and
  // bookmarks still land there. (permanent: false, in case it moves again.)
  async redirects() {
    return [{ source: "/account", destination: "/settings", permanent: false }];
  },
};

export default nextConfig;
