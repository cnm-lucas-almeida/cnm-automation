import type { NextConfig } from "next";

const allowedDevOrigins = [
  'host.docker.internal',
  '*.*.*.*',
  process.env.NEXT_DEV_ALLOWED_ORIGIN,
].filter((origin): origin is string => Boolean(origin));

const nextConfig: NextConfig = {
  allowedDevOrigins,
};

export default nextConfig;
