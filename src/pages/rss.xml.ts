import { getCollection } from 'astro:content';

export const prerender = true;

const SITE = 'https://worldtvchannels.com';

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
}

export async function GET() {
  const posts = (await getCollection('blog'))
    .sort((a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime());

  const items = posts
    .map((p) => `    <item>
      <title>${esc(p.data.title)}</title>
      <link>${SITE}/blog/${p.slug}</link>
      <guid isPermaLink="true">${SITE}/blog/${p.slug}</guid>
      <description>${esc(p.data.description)}</description>
      <pubDate>${new Date(p.data.date).toUTCString()}</pubDate>
      ${p.data.tags.map((t) => `<category>${esc(t)}</category>`).join('')}
    </item>`)
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>World TV Channels — Blog</title>
    <link>${SITE}/blog</link>
    <description>Articles about international TV channels, broadcasting and online streaming.</description>
    <language>en</language>
    <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}
