import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  // self-contained server bundle for the Docker image
  output: 'standalone',
  /* config options here */
};

export default nextConfig;
