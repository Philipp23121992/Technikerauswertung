import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Netzwerk-/Domain-Zugriff darf Dev-Chunks laden
  allowedDevOrigins: [
    "apm-servicetools.de",
    "www.apm-servicetools.de",
    "krsystems-techtools.de",
    "www.krsystems-techtools.de",
    "164.132.79.76",
    "127.0.0.1",
    "localhost",
  ],
  transpilePackages: ["leaflet", "react-leaflet"],
  serverExternalPackages: [
    "pdf-parse",
    "pdfjs-dist",
    "imapflow",
    "mailparser",
    "@kenjiuno/msgreader",
    "iconv-lite",
  ],
  experimental: {
    proxyClientMaxBodySize: "50mb",
    cpus: 1,
  },
};

export default nextConfig;
