import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile the SDK source directly so turbopack watches for changes
  transpilePackages: ["@trustloop/sdk"],
};

export default nextConfig;
