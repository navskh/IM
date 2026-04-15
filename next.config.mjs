/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['sql.js'],
  outputFileTracingIncludes: {
    '**/*': ['./node_modules/sql.js/dist/sql-wasm.wasm'],
  },
};

export default nextConfig;
