import { defineConfig } from 'astro/config';

import cloudflare from "@astrojs/cloudflare";

// PLACEHOLDER: replace with the production domain you'll host on.
// The static public/sitemap.xml + robots.txt reference this domain too —
// remember to update them if it changes.
const SITE = 'https://radio-bulgaria.app';

export default defineConfig({
  site: SITE,
  trailingSlash: 'never',
  output: "hybrid",
  adapter: cloudflare(),
});
