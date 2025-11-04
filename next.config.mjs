/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ['*'] },
  },
  images: {
    remotePatterns: [
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
