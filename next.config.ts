// next.config.ts
import type { NextConfig } from 'next';

const isCI = process.env.CI === 'true' || process.env.VERCEL === '1';

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: isCI, // ignore on CI/Vercel, enforce locally
  },
  experimental: {
    typedRoutes: false, // 👈 disables the strict route typing
  },
};

export default nextConfig;
