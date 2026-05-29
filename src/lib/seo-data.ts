// Curated metadata for SEO landing pages (categories & countries).
// The live channel counts come from the iptv-org dataset at runtime; this file
// supplies stable slugs, human names and intro copy so the pages always have
// crawlable, unique content even if the upstream feed is briefly unavailable.

export interface CategoryDef {
  /** URL slug, e.g. "news". */
  slug: string;
  /** iptv-org display name used to match channels, e.g. "News". */
  name: string;
  /** One-line meta description. */
  blurb: string;
  /** Longer intro paragraph shown on the landing page. */
  intro: string;
}

export const CATEGORIES: CategoryDef[] = [
  {
    slug: 'news',
    name: 'News',
    blurb: 'Watch live news channels from around the world — breaking news, politics and analysis, free online.',
    intro:
      'Follow breaking stories as they happen with live news channels from broadcasters across the globe. Compare how networks in different countries cover the same events, from rolling international news to regional bulletins.',
  },
  {
    slug: 'sports',
    name: 'Sports',
    blurb: 'Live sports TV channels online — highlights, talk shows and live event coverage, free.',
    intro:
      'Catch live sports coverage, highlights, analysis and dedicated sports talk channels from broadcasters worldwide. A single place to find sports television from many different countries.',
  },
  {
    slug: 'movies',
    name: 'Movies',
    blurb: 'Free live movie channels online — films and cinema networks streaming around the clock.',
    intro:
      'Tune into channels dedicated to films and cinema, broadcasting movies around the clock. Browse movie networks from different regions, all playing live in your browser.',
  },
  {
    slug: 'music',
    name: 'Music',
    blurb: 'Live music TV channels — music videos, charts and concerts, streaming free online.',
    intro:
      'Watch non-stop music television — music videos, chart shows, live performances and themed music channels from broadcasters across the world.',
  },
  {
    slug: 'kids',
    name: 'Kids',
    blurb: 'Live kids TV channels online — cartoons and children’s programming, free to watch.',
    intro:
      'Family-friendly children’s channels featuring cartoons, animation and educational programming. Adult content is filtered out of the catalogue across the whole site.',
  },
  {
    slug: 'entertainment',
    name: 'Entertainment',
    blurb: 'Live entertainment TV channels — shows, talk, reality and variety, free online.',
    intro:
      'General entertainment channels packed with shows, talk, reality and variety programming from broadcasters in many countries.',
  },
  {
    slug: 'documentary',
    name: 'Documentary',
    blurb: 'Live documentary channels online — nature, history, science and factual TV, free.',
    intro:
      'Explore documentary channels covering nature, history, science and current affairs. Factual television from broadcasters around the world, streaming live.',
  },
  {
    slug: 'lifestyle',
    name: 'Lifestyle',
    blurb: 'Live lifestyle TV channels — food, home, fashion and culture, free online.',
    intro:
      'Lifestyle channels spanning food, home, fashion, wellbeing and culture, broadcast live from networks across the globe.',
  },
  {
    slug: 'education',
    name: 'Education',
    blurb: 'Live educational TV channels online — learning, science and culture, free to watch.',
    intro:
      'Educational and public-service channels focused on learning, science and culture, including content from public broadcasters worldwide.',
  },
  {
    slug: 'business',
    name: 'Business',
    blurb: 'Live business & finance TV channels — markets and economic news, free online.',
    intro:
      'Business and finance channels covering markets, the economy and corporate news, streaming live from broadcasters in different regions.',
  },
  {
    slug: 'comedy',
    name: 'Comedy',
    blurb: 'Live comedy TV channels online — sitcoms, stand-up and humor, free to watch.',
    intro:
      'Comedy channels featuring sitcoms, stand-up and light entertainment from broadcasters around the world.',
  },
  {
    slug: 'culture',
    name: 'Culture',
    blurb: 'Live culture & arts TV channels — arts, heritage and society, free online.',
    intro:
      'Cultural channels exploring the arts, heritage and society, including programming from international public broadcasters.',
  },
  {
    slug: 'general',
    name: 'General',
    blurb: 'Live general-interest TV channels online — a broad mix of programming, free.',
    intro:
      'Flagship general-interest channels offering a broad mix of news, drama, entertainment and live events from broadcasters worldwide.',
  },
  {
    slug: 'religious',
    name: 'Religious',
    blurb: 'Live religious & faith TV channels online — worship and faith programming, free.',
    intro:
      'Faith and religious channels broadcasting worship, teaching and community programming from around the world.',
  },
  {
    slug: 'science',
    name: 'Science',
    blurb: 'Live science TV channels online — technology, nature and discovery, free to watch.',
    intro:
      'Science and technology channels covering discovery, nature and innovation, streaming live from broadcasters in many countries.',
  },
  {
    slug: 'travel',
    name: 'Travel',
    blurb: 'Live travel TV channels online — destinations and adventure, free to watch.',
    intro:
      'Travel channels showcasing destinations, cultures and adventure from broadcasters across the globe.',
  },
];

export function categoryBySlug(slug: string): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.slug === slug.toLowerCase());
}

export interface CountryDef {
  /** ISO 3166-1 alpha-2 code, lower-case in URLs. */
  code: string;
  name: string;
}

// A curated list of major TV markets used for the sitemap and the country hub.
// Any valid country code still resolves at runtime; this is just the static set
// we explicitly advertise to search engines.
export const TOP_COUNTRIES: CountryDef[] = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'PT', name: 'Portugal' },
  { code: 'IE', name: 'Ireland' },
  { code: 'BE', name: 'Belgium' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'AT', name: 'Austria' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'PL', name: 'Poland' },
  { code: 'CZ', name: 'Czechia' },
  { code: 'GR', name: 'Greece' },
  { code: 'RO', name: 'Romania' },
  { code: 'TR', name: 'Turkey' },
  { code: 'RU', name: 'Russia' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'AR', name: 'Argentina' },
  { code: 'AU', name: 'Australia' },
  { code: 'IN', name: 'India' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'CN', name: 'China' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'ZA', name: 'South Africa' },
];

export function countryByCode(code: string): CountryDef | undefined {
  return TOP_COUNTRIES.find((c) => c.code === code.toUpperCase());
}
