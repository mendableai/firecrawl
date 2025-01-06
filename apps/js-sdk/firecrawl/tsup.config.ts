import { defineConfig } from "tsup";

export default defineConfig({
  entryPoints: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  outDir: "dist",
  clean: true,
  esbuildOptions(options, context) {
    options.define = {
      __WEBSOCKET_LOADER__: JSON.stringify(
        context.format === 'cjs' 
          ? `const { WebSocket } = require('isows'); WebSocket`
          : `import('isows').then(m => m.WebSocket)`
      )
    };
  },
});