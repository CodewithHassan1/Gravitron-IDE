/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@ag/proto", "@ag/config", "@ag/validation", "@ag/core", "@ag/protocol"],
  reactStrictMode: true,
  output: 'export',
  distDir: 'dist',
  images: { unoptimized: true },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };
    return config;
  },
};

export default nextConfig;
