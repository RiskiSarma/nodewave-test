import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pin the workspace root so a stray lockfile in a parent folder is ignored
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
