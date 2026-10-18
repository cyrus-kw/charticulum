import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Account page became the floating Settings panel (opened from the
  // account menu); old links and bookmarks land on the dashboard.
  // (permanent: false, in case it changes again.)
  async redirects() {
    return [{ source: "/account", destination: "/dashboard", permanent: false }];
  },
};

export default nextConfig;
