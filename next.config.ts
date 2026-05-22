import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // node-pg-migrate uses dynamic file:// imports that Turbopack cannot bundle statically.
  // Marking it external lets Node.js require it at runtime instead.
  serverExternalPackages: ["node-pg-migrate"],
};

export default nextConfig;
