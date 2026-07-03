import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// The browser calls the backend directly, so connect-src must allow its
// origin. Derived from NEXT_PUBLIC_API_URL at build time (Vercel sets it to
// the public backend URL; local dev falls back to localhost).
const backendOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000")
      .origin;
  } catch {
    return "http://localhost:3000";
  }
})();

// script-src 'unsafe-inline' accommodates the inline theme pre-paint script
// in app/layout.tsx; 'unsafe-eval' and ws: are dev-only (React Refresh, HMR).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self' ${backendOrigin}${isDev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
