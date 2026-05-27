import type { APIRoute } from 'astro';

export const prerender = true;

const API_BY_CODE = 'https://de1.api.radio-browser.info/json/stations/bycountrycodeexact/BG';
const API_BY_NAME = 'https://de1.api.radio-browser.info/json/stations/bycountry/Bulgaria';
const QUERY = '?limit=2000&hidebroken=true&order=clickcount&reverse=true';

export const GET: APIRoute = async () => {
  const [r1, r2] = await Promise.all([
    fetch(API_BY_CODE + QUERY),
    fetch(API_BY_NAME + QUERY).catch(() => null),
  ]);

  const raw1 = r1.ok ? await r1.json() : [];
  const raw2 = r2 && r2.ok ? await r2.json() : [];

  const seenUuid = new Set(raw1.map((s: any) => s.stationuuid));
  const merged = [...raw1, ...raw2.filter((s: any) => !seenUuid.has(s.stationuuid))];

  const seenName = new Set<string>();
  const deduped: any[] = [];
  for (const s of merged) {
    const key = s.name.trim().toLowerCase();
    if (seenName.has(key)) continue;
    seenName.add(key);
    deduped.push(s);
  }

  const filtered = deduped.filter((s: any) => s.url_resolved.startsWith('https://'));

  return new Response(JSON.stringify(filtered), {
    headers: { 'Content-Type': 'application/json' },
  });
};
