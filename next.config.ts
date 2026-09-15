import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["imapflow", "mailparser", "tsdav", "node-ical"],
};

export default nextConfig;
