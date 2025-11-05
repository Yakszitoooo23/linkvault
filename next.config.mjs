/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ['*'] },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'd03a46a933a1d9db079386771194389f.r2.dev',
      },
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
  webpack: (config, { isServer }) => {
    // Make Supabase optional for build - mark as external
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        '@supabase/supabase-js': 'commonjs @supabase/supabase-js',
      });
    }
    return config;
  },
};

export default nextConfig;
