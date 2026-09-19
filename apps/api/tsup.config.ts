import { defineConfig } from 'tsup';

export default defineConfig({
  // `index` binds a port; `serverless` exports the same app as a request handler.
  entry: ['src/index.ts', 'src/serverless.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Workspace packages ship TypeScript source, so they are bundled into the build.
  noExternal: [/^@sanjeevani\//],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
});
