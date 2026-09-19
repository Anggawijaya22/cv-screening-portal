import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['local-origin.dev', '*.local-origin.dev'],
  serverExternalPackages: ['pdf-parse', 'canvas', '@napi-rs/canvas', 'tesseract.js', 'cfb', 'jszip'],
};

export default nextConfig;
