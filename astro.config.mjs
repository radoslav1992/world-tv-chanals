import { defineConfig } from 'astro/config';

import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: 'https://example.com',
  trailingSlash: 'never',
  output: "hybrid",
  adapter: cloudflare()
});