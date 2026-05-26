import { defineConfig } from 'astro/config';
import cloudflare from "@astrojs/cloudflare";

// Replace with your production domain.
const SITE = 'https://bulgariaradio.com';

export default defineConfig({
  site: SITE,
  trailingSlash: 'never',
  output: "hybrid",
  adapter: cloudflare(),
});
