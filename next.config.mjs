/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output bundles a self-contained Node.js server with minimal
  // dependencies. This avoids absolute-path pollution in pre-built packages
  // and lets IM run from any install location on any OS.
  output: 'standalone',
  serverExternalPackages: ['sql.js'],
  outputFileTracingIncludes: {
    '**/*': ['./node_modules/sql.js/dist/sql-wasm.wasm'],
  },
};

export default nextConfig;
