/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ffmpeg-static / ffprobe-static ship native binaries that must not be bundled
  // by the server build. Keep them external so their resolved paths stay valid.
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static", "@anthropic-ai/sdk"],
  eslint: {
    // Linting is run explicitly via `npm run lint`; don't fail production builds on it.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
