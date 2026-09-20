/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["*"],
    },
  },
  // Netlify compatibility: no static export needed, keep server rendering for API + auth
  // If deploying to Netlify with Next Runtime, this config works out of the box
};

export default nextConfig;
