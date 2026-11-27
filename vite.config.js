import { defineConfig } from 'vite';

// Pages serves static HTML. Apply the policy before the built page loads any assets.
const policy = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self' blob:", // GLTFLoader fetches embedded textures via object URLs.
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export default defineConfig({
  build: {
    manifest: 'asset-manifest.json',
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              debugName: 'Three.js',
              test: /[\\/]node_modules[\\/]three[\\/]/,
              name: (id) =>
                id.endsWith('three.core.js') ? 'three-core' : 'three-renderer',
            },
          ],
        },
      },
    },
  },
  plugins: [
    {
      name: 'pages-metadata',
      apply: 'build',
      transformIndexHtml() {
        const tags = [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
            injectTo: 'head-prepend',
          },
        ];
        if (process.env.GITHUB_SHA) {
          tags.push({
            tag: 'meta',
            attrs: { name: 'release-revision', content: process.env.GITHUB_SHA },
          });
        }
        return tags;
      },
    },
  ],
});
