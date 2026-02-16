import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Use this app's directory as the root for dependency tracing (avoids warning when repo has multiple lockfiles).
  outputFileTracingRoot: path.join(__dirname),
  // Only set if you serve this app at unitea.app/moderation (path-based). Leave empty or remove for moderation.unitea.app (subdomain).
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
};

export default nextConfig;
