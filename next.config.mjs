/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── Performance ─────────────────────────────────────────────
  compress: true,
  poweredByHeader: false,

  // ── Images ──────────────────────────────────────────────────
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/render/**",
      },
    ],
  },

  // ── Experimental ────────────────────────────────────────────
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },

  // ── Headers (security) ──────────────────────────────────────
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
