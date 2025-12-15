/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Static export para deployment
  output: 'export',
  // NO usar basePath para dominio personalizado (app.nordrivecars.com)
  // Solo usar basePath si estás en GitHub Pages subdirectorio
  // basePath: process.env.GITHUB_PAGES === 'true' ? '/car-import-app' : '',
  // assetPrefix: process.env.GITHUB_PAGES === 'true' ? '/car-import-app' : '',
}

export default nextConfig
