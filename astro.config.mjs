import { defineConfig } from 'astro/config';
import cloudflare from "@astrojs/cloudflare";

// Replace with your production domain.
const SITE = 'https://radio-bulgaria.app';

export default defineConfig({
  site: SITE,
  trailingSlash: 'never',
  output: "hybrid",
  adapter: cloudflare(),
});
