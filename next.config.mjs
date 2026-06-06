/** @type {import('next').NextConfig} */

// On Replit: always derive NEXTAUTH_URL from the live dev domain.
// On Vercel: NEXTAUTH_URL must be set in Vercel's environment variables.
if (process.env.REPLIT_DEV_DOMAIN) {
  process.env.NEXTAUTH_URL = `https://${process.env.REPLIT_DEV_DOMAIN}`
}

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  allowedDevOrigins: [
    "*.replit.dev",
    "*.sisko.replit.dev",
    "*.kirk.replit.dev",
    "*.picard.replit.dev",
    ...(process.env.REPLIT_DEV_DOMAIN
      ? [`https://${process.env.REPLIT_DEV_DOMAIN}`, process.env.REPLIT_DEV_DOMAIN]
      : []),
  ],
}

export default nextConfig
