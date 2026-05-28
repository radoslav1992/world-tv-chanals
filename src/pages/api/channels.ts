import type { APIRoute } from 'astro';
import { getDataset, type Channel } from '../../lib/iptv';

export const prerender = false;

const DEFAULT_LIMIT = 48;
const MAX_LIMIT = 100;

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=300, s-maxage=3600',
};

export const GET: APIRoute = async ({ url }) => {
  try {
    const { channels } = await getDataset();

    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const category = (url.searchParams.get('category') || '').trim().toLowerCase();
    const country = (url.searchParams.get('country') || '').trim().toUpperCase();
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
    );

    let list: Channel[] = channels;
    if (category) {
      list = list.filter((c) => c.categories.toLowerCase().includes(category));
    }
    if (country) {
      list = list.filter((c) => c.countryCode === country);
    }
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.network.toLowerCase().includes(q) ||
          c.country.toLowerCase().includes(q),
      );
    }

    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    const items = list.slice(start, start + limit);

    return new Response(
      JSON.stringify({ items, total, page: safePage, totalPages, limit }),
      { headers: HEADERS },
    );
  } catch {
    return new Response(
      JSON.stringify({ items: [], total: 0, page: 1, totalPages: 1, limit: DEFAULT_LIMIT }),
      { status: 502, headers: HEADERS },
    );
  }
};
