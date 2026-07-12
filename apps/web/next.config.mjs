/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@blueline/engine'],
  webpack: (config) => {
    // engine uses NodeNext-style ".js" specifiers in TS source
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
