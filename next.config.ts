import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["@libsql/client"],
  transpilePackages: ["recharts"],
};

export default config;
