/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep large Node-only libraries out of Turbopack's server graph. Bundling
  // ExcelJS made the development cache grow close to 1 GB.
  serverExternalPackages: ['mysql2', 'exceljs'],
};

module.exports = nextConfig;
