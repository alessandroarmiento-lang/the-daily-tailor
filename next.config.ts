import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for the Fly.io Docker image (local `next start` unchanged).
  output: "standalone",
  serverExternalPackages: ["imapflow", "mailparser", "tsdav", "node-ical"],
};

export default nextConfig;
