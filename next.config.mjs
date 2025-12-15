/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Static export para GitHub Pages
  output: 'export',
  // Base path para GitHub Pages (username.github.io/repo-name)
  basePath: process.env.NODE_ENV === 'production' ? '/car-import-app' : '',
  // Asset prefix para rutas correctas
  assetPrefix: process.env.NODE_ENV === 'production' ? '/car-import-app' : '',
}

export default nextConfig
