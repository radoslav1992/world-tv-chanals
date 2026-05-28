import type { APIRoute } from 'astro';
import { getDataset } from '../../lib/iptv';

export const prerender = false;

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=600, s-maxage=3600',
};

export const GET: APIRoute = async () => {
  try {
    const { channels, categories, countries } = await getDataset();
    return new Response(
      JSON.stringify({
        total: channels.length,
        categories: categories.slice(0, 24),
        countries: countries.slice(0, 30),
      }),
      { headers: HEADERS },
    );
  } catch {
    return new Response(
      JSON.stringify({ total: 0, categories: [], countries: [] }),
      { status: 502, headers: HEADERS },
    );
  }
};
