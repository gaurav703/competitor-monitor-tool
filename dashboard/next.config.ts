import type { NextConfig } from "next";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

const repoRoot = path.resolve(__dirname, "..");

const serverPackages = [
  "mongoose",
  "cheerio",
  "htmlparser2",
  "entities",
  "parse5",
  "google-play-scraper",
  "app-store-scraper",
  "rss-parser",
  "nodemailer",
  "@google/genai",
];

const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot,
  typescript: {
    ignoreBuildErrors: true,
    tsconfigPath: "tsconfig.build.json",
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    externalDir: true,
  },
  serverExternalPackages: serverPackages,
  webpack: (config, { dev, isServer }) => {
    const dashboardModules = path.resolve(__dirname, "node_modules");
    const rootModules = path.resolve(repoRoot, "node_modules");
    config.resolve.modules = [
      dashboardModules,
      rootModules,
      ...(config.resolve.modules ?? ["node_modules"]),
    ];

    if (isServer) {
      const previous = config.externals;
      config.externals = [
        ...(Array.isArray(previous) ? previous : previous ? [previous] : []),
        ({ request }: { request?: string }, callback: (error?: Error | null, result?: string) => void) => {
          if (request === "google-play-scraper") {
            callback(undefined, `import ${request}`);
            return;
          }
          if (request && serverPackages.includes(request)) {
            callback(undefined, `commonjs ${request}`);
            return;
          }
          callback();
        },
      ];
    }

    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
        aggregateTimeout: 300,
        ignored: ["**/node_modules/**", "**/.git/**"],
      };
      config.snapshot = {
        ...config.snapshot,
        managedPaths: [],
        immutablePaths: [],
      };
    }
    return config;
  },
};

export default nextConfig;
