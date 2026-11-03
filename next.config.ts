import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    "*": ["./data/**"],
  },
  experimental: {
    proxyClientMaxBodySize: "4gb",
  },
};

export default nextConfig;
