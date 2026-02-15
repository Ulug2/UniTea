import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Use this app's directory as the root for dependency tracing (avoids warning when repo has multiple lockfiles).
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
