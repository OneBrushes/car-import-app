/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Removido 'output: export' para habilitar API routes
  // Cloudflare Pages necesita las API routes para Stripe
}

export default nextConfig
