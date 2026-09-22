import type { NextConfig } from "next";

// `output: 'standalone'` is only for the Docker image (the Dockerfile sets
// BUILD_STANDALONE=1 and runs `node server.js`). A normal build must NOT set
// it: `next start` — what `npm start` and pm2 use — refuses to serve a
// standalone build and warns "next start does not work with output: standalone".
const standalone = process.env.BUILD_STANDALONE === '1';

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  ...(standalone ? { output: 'standalone' as const } : {}),
};

export default nextConfig;
