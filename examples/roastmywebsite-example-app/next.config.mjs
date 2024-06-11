/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    G1: process.env.G1,
    G2: process.env.G2,
    G3: process.env.G3,
    G4: process.env.G4,
  },
};

export default nextConfig;
