/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // Enable edge runtime for API routes
    experimental: {
        serverActions: {
            allowedOrigins: ['*'],
        },
    },
};

export default nextConfig;
