import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The game engine owns its DOM; double-mounting in dev would start it twice.
  reactStrictMode: false,
};

export default nextConfig;
