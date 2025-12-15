/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Static export para GitHub Pages y Cloudflare Pages
  output: 'export',
  // Base path solo para GitHub Pages (detecta con variable de entorno)
  // En Cloudflare Pages: sin basePath (dominio propio)
  // En GitHub Pages: con basePath (subdirectorio)
  basePath: process.env.GITHUB_PAGES === 'true' ? '/car-import-app' : '',
  assetPrefix: process.env.GITHUB_PAGES === 'true' ? '/car-import-app' : '',
}

export default nextConfig
