/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ["*"] },
  },
  images: {
    domains: [
      "linkvault-five.vercel.app",
      // "your-bucket-id.r2.dev",
      // "cdn.yourdomain.com",
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

