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
};

export default nextConfig;
