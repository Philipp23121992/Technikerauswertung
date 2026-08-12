import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // LAN-Zugriff (z. B. http://192.168.x.x:3002) darf Dev-Chunks laden
  allowedDevOrigins: ["192.168.178.65", "127.0.0.1"],
  transpilePackages: ["leaflet", "react-leaflet"],
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  experimental: {
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
