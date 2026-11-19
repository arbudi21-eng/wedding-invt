import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The generator engine lives at <repo>/lib/core.js, one level above this app.
  // Turbopack must be told that the repo root — not apps/web — owns the bundle.
  turbopack: {
    root: path.join(here, '..', '..'),
  },
  experimental: {
    serverActions: {
      // 40 MB cap lets a small video reach the upload action.
      bodySizeLimit: '40mb',
    },
    // The proxy clones and buffers request bodies before they reach the
    // action; its own default cap is 10 MB and it silently truncates.
    // Video uploads need the full 40 MB + overhead.
    proxyClientMaxBodySize: '45mb',
  },
};

export default nextConfig;
