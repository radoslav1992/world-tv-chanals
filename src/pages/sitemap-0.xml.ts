import { getCollection } from 'astro:content';

export const prerender = true;

const SITE = 'https://worldtvchannels.org';

const staticPages = [
  { loc: '/', changefreq: 'weekly', priority: '1.0' },
  { loc: '/channels', changefreq: 'weekly', priority: '0.9' },
  { loc: '/blog', changefreq: 'weekly', priority: '0.9' },
  { loc: '/about', changefreq: 'monthly', priority: '0.7' },
  { loc: '/contact', changefreq: 'monthly', priority: '0.7' },
  { loc: '/privacy-policy', changefreq: 'yearly', priority: '0.5' },
  { loc: '/terms', changefreq: 'yearly', priority: '0.5' },
];

export async function GET() {
  const [posts, channels] = await Promise.all([
    getCollection('blog'),
    getCollection('channels'),
  ]);

  const blogEntries = posts
    .sort((a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime())
    .map((post) => ({
      loc: `/blog/${post.slug}`,
      lastmod: post.data.updated || post.data.date,
      changefreq: 'monthly',
      priority: '0.8',
    }));

  const channelEntries = channels
    .sort((a, b) => a.data.name.localeCompare(b.data.name, 'en'))
    .map((c) => ({
      loc: `/channels/${c.slug}`,
      lastmod: new Date().toISOString().split('T')[0],
      changefreq: 'monthly',
      priority: '0.8',
    }));

  const allEntries = [
    ...staticPages.map((p) => ({ ...p, lastmod: new Date().toISOString().split('T')[0] })),
    ...channelEntries,
    ...blogEntries,
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allEntries
  .map(
    (e) => `  <url>
    <loc>${SITE}${e.loc}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
