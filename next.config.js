/** @type {import('next').NextConfig} */
const path = require('path');
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  typescript: {
    tsconfigPath: 'tsconfig.json',
  },
  // CSS: PostCSS/Tailwind работают по умолчанию, не добавлять cssModules и не отключать обработку CSS
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.yandexcloud.net' },
      { protocol: 'https', hostname: '**.cloudinary.com' },
      { protocol: 'https', hostname: 'cdn.discordapp.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**.githubusercontent.com' },
      { protocol: 'https', hostname: '**.vercel.app' },
      { protocol: 'http', hostname: 'localhost' },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname),
    };
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    });
    return config;
  },
  async rewrites() {
    // Проксируем /api/* → бэкенд 1:1 (Express роуты: /api/auth/login, /api/messages и т.д.)
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
    return {
      beforeFiles: [
        { source: '/api/:path*', destination: `${apiUrl}/api/:path*` },
        { source: '/health', destination: `${apiUrl}/health` },
      ],
    };
  },
};

module.exports = nextConfig;
