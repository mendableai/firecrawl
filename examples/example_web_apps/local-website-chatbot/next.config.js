/** @type {import('next').NextConfig} */
const nextConfig = {
  // (Optional) Export as a static site
  // See https://nextjs.org/docs/pages/building-your-application/deploying/static-exports#configuration
  output: 'export', // Feel free to modify/remove this option

  // Override the default webpack configuration
  webpack: (config, { isServer }) => {
      // See https://webpack.js.org/configuration/resolve/#resolvealias
      config.resolve.alias = {
          ...config.resolve.alias,
          "sharp$": false,
          "onnxruntime-node$": false,
      }
      config.experiments = {
        ...config.experiments,
        topLevelAwait: true,
        asyncWebAssembly: true,
      };
      config.module.rules.push({
        test: /\.md$/i,
        use: "raw-loader",
      });
      // Fixes npm packages that depend on `fs` module
      if (!isServer) {
        config.resolve.fallback = {
          ...config.resolve.fallback, // if you miss it, all the other options in fallback, specified
            // by next.js will be dropped. Doesn't make much sense, but how it is
          fs: false, // the solution
          "node:fs/promises": false,
          module: false,
          perf_hooks: false,
        };
      }
      return config;
  },
}

module.exports = nextConfig