import type { APIRoute } from 'astro';

export const prerender = false;

const API_VOTE = 'https://de1.api.radio-browser.info/json/vote/';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { uuid } = await request.json();
    if (!uuid || typeof uuid !== 'string') {
      return new Response(JSON.stringify({ error: 'missing uuid' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(API_VOTE + encodeURIComponent(uuid), { method: 'POST' });
    const data = await res.json();

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'vote failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
