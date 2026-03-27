/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['sql.js/dist/sql-asm.js'],
  turbopack: false,
};

export default nextConfig;
