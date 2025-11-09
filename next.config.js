/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["*", "*.apps.whop.com"],
    },
    optimizePackageImports: ["frosted-ui"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-edb4941ad2dc4265a302abdc5178040c.r2.dev",
      },
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        "@supabase/supabase-js": "commonjs @supabase/supabase-js",
      });
    }
    return config;
  },
};

module.exports = nextConfig;
