/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Static export para Cloudflare Pages
  // Las API routes se manejan con Cloudflare Workers
  output: 'export',
}

export default nextConfig
