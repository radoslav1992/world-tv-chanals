// Server-side data layer for the iptv-org public API.
// Fetches channels + streams + reference data, merges them into a single
// list of playable TV channels, and caches the result in module memory.
// Used by the SSR endpoints in src/pages/api/.

export interface Channel {
  id: string;
  name: string;
  url: string;
  logo: string;
  /** Comma-separated category display names (e.g. "News, Documentary"). */
  categories: string;
  /** Country display name (e.g. "United Kingdom"). */
  country: string;
  /** ISO 3166-1 alpha-2 code (e.g. "GB"). */
  countryCode: string;
  /** Country flag emoji, when known. */
  flag: string;
  /** Comma-separated language display names. */
  languages: string;
  network: string;
}

export interface Facet {
  id: string;
  name: string;
  count: number;
  flag?: string;
}

interface Dataset {
  at: number;
  channels: Channel[];
  categories: Facet[];
  countries: Facet[];
}

const API = 'https://iptv-org.github.io/api';
const TTL = 60 * 60 * 1000; // 1 hour

let cache: Dataset | null = null;
let inflight: Promise<Dataset> | null = null;

async function fetchJson(path: string): Promise<any[]> {
  try {
    const res = await fetch(`${API}/${path}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function parseQuality(q: unknown): number {
  if (typeof q !== 'string') return 0;
  const m = q.match(/(\d{3,4})/);
  return m ? parseInt(m[1], 10) : 0;
}

function uniqJoin(values: Array<string | undefined | null>): string {
  return [...new Set(values.filter((v): v is string => !!v))].join(', ');
}

async function build(): Promise<Dataset> {
  const [rawChannels, rawStreams, rawCategories, rawCountries, rawLanguages, rawLogos] =
    await Promise.all([
      fetchJson('channels.json'),
      fetchJson('streams.json'),
      fetchJson('categories.json'),
      fetchJson('countries.json'),
      fetchJson('languages.json'),
      fetchJson('logos.json'),
    ]);

  // Logos live in a separate file in the current API; index the first per channel.
  const logoByChannel = new Map<string, string>();
  for (const l of rawLogos) {
    if (l?.channel && l?.url && !logoByChannel.has(l.channel)) {
      logoByChannel.set(l.channel, l.url);
    }
  }

  const categoryNames = new Map<string, string>();
  for (const c of rawCategories) {
    if (c?.id) categoryNames.set(c.id, c.name || c.id);
  }

  const countryInfo = new Map<string, { name: string; flag: string }>();
  for (const c of rawCountries) {
    if (c?.code) countryInfo.set(c.code, { name: c.name || c.code, flag: c.flag || '' });
  }

  const languageNames = new Map<string, string>();
  for (const l of rawLanguages) {
    if (l?.code) languageNames.set(l.code, l.name || l.code);
  }

  interface Meta {
    name: string;
    logo: string;
    categories: string[];
    country: string;
    network: string;
    languages: string[];
    isNsfw: boolean;
  }
  const channelMeta = new Map<string, Meta>();
  for (const c of rawChannels) {
    if (!c?.id) continue;
    channelMeta.set(c.id, {
      name: c.name || c.id,
      logo: c.logo || '',
      categories: Array.isArray(c.categories) ? c.categories : [],
      country: c.country || '',
      network: c.network || '',
      languages: Array.isArray(c.languages) ? c.languages : [],
      isNsfw: c.is_nsfw === true,
    });
  }

  // Pick the best HTTPS stream per channel (highest resolution wins).
  interface Picked {
    url: string;
    quality: number;
    title: string;
    channelId: string | null;
  }
  const picked = new Map<string, Picked>();
  for (const s of rawStreams) {
    const url: unknown = s?.url;
    if (typeof url !== 'string' || !url.startsWith('https://')) continue;
    const channelId: string | null = typeof s.channel === 'string' && s.channel ? s.channel : null;
    const title: string = (typeof s.title === 'string' && s.title) || (typeof s.name === 'string' && s.name) || '';
    // Unmatched streams without any name are skipped to keep the list meaningful.
    if (!channelId && !title) continue;
    const key = channelId || `url:${url}`;
    const quality = parseQuality(s.quality);
    const existing = picked.get(key);
    if (!existing || quality > existing.quality) {
      picked.set(key, { url, quality, title, channelId });
    }
  }

  const channels: Channel[] = [];
  const categoryCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();

  for (const [key, p] of picked) {
    const meta = p.channelId ? channelMeta.get(p.channelId) : undefined;
    if (meta?.isNsfw) continue;
    // Skip orphan streams we have no usable name for.
    if (!meta && !p.title) continue;

    const catIds = meta?.categories ?? [];
    const catLabels = catIds.map((id) => categoryNames.get(id) || id);
    const cc = meta?.country ?? '';
    const ci = countryInfo.get(cc);
    const langLabels = (meta?.languages ?? []).map((id) => languageNames.get(id) || id);
    const logo = meta?.logo || (p.channelId ? logoByChannel.get(p.channelId) : '') || '';

    channels.push({
      id: p.channelId || key,
      name: meta?.name || p.title || 'Live Channel',
      url: p.url,
      logo,
      categories: catLabels.join(', '),
      country: ci?.name || '',
      countryCode: cc,
      flag: ci?.flag || '',
      languages: uniqJoin(langLabels),
      network: meta?.network || '',
    });

    for (const label of new Set(catLabels)) {
      categoryCounts.set(label, (categoryCounts.get(label) || 0) + 1);
    }
    if (cc) countryCounts.set(cc, (countryCounts.get(cc) || 0) + 1);
  }

  // Channels with a logo and a real name sort first, then alphabetical.
  channels.sort((a, b) => {
    const al = a.logo ? 0 : 1;
    const bl = b.logo ? 0 : 1;
    if (al !== bl) return al - bl;
    return a.name.localeCompare(b.name, 'en');
  });

  const categories: Facet[] = [...categoryCounts.entries()]
    .map(([name, count]) => ({ id: name, name, count }))
    .sort((a, b) => b.count - a.count);

  const countries: Facet[] = [...countryCounts.entries()]
    .map(([code, count]) => ({
      id: code,
      name: countryInfo.get(code)?.name || code,
      flag: countryInfo.get(code)?.flag || '',
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return { at: Date.now(), channels, categories, countries };
}

export async function getDataset(): Promise<Dataset> {
  if (cache && Date.now() - cache.at < TTL) return cache;
  if (inflight) return inflight;
  inflight = build()
    .then((ds) => {
      // Only keep a non-empty dataset; an upstream hiccup shouldn't poison cache.
      if (ds.channels.length > 0) cache = ds;
      return cache ?? ds;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
