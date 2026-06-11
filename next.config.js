/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverExternalPackages: ["pdf-parse"],
  },
};

module.exports = nextConfig;
