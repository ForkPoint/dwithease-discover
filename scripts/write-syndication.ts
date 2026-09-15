import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import type { Feed, FeedItem } from './feed-schema.ts';
import { FeedSchema } from './feed-schema.ts';

export function escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (char) => {
        switch (char) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return char;
        }
    });
}

export function generateRss(feed: Feed, siteUrl = 'https://discover.dwithease.com/'): string {
    const channelUrl = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
    const rssUrl = `${channelUrl}rss.xml`;
    const lastBuildDate = new Date(feed.updatedAt).toUTCString();

    const itemsXml = feed.items.map((item: FeedItem) => {
        const pubDate = new Date(item.publishedAt).toUTCString();
        const categories = (item.tags || [])
            .map((tag) => `      <category>${escapeXml(tag)}</category>`)
            .join('\n');

        return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.url)}</link>
      <guid isPermaLink="false">${escapeXml(item.id)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(item.summary)}</description>
      <source url="${escapeXml(item.source.url)}">${escapeXml(item.source.name)}</source>
${categories}
    </item>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>DWithEase Discover</title>
    <link>${channelUrl}</link>
    <description>Commerce news, technical articles, and useful tools for teams that build online stores.</description>
    <language>${escapeXml(feed.locale)}</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${rssUrl}" rel="self" type="application/rss+xml"/>
${itemsXml}
  </channel>
</rss>
`;
}

export function generateAtom(feed: Feed, siteUrl = 'https://discover.dwithease.com/'): string {
    const channelUrl = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
    const atomUrl = `${channelUrl}atom.xml`;
    const updated = new Date(feed.updatedAt).toISOString();

    const entriesXml = feed.items.map((item: FeedItem) => {
        const published = new Date(item.publishedAt).toISOString();
        const categories = (item.tags || [])
            .map((tag) => `    <category term="${escapeXml(tag)}"/>`)
            .join('\n');

        return `  <entry>
    <id>${escapeXml(`${channelUrl}#${item.id}`)}</id>
    <title>${escapeXml(item.title)}</title>
    <link href="${escapeXml(item.url)}" rel="alternate"/>
    <published>${published}</published>
    <updated>${published}</updated>
    <summary>${escapeXml(item.summary)}</summary>
    <author>
      <name>${escapeXml(item.source.name)}</name>
      <uri>${escapeXml(item.source.url)}</uri>
    </author>
${categories}
  </entry>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${channelUrl}</id>
  <title>DWithEase Discover</title>
  <subtitle>Commerce news, technical articles, and useful tools for teams that build online stores.</subtitle>
  <link href="${channelUrl}" rel="alternate" type="text/html"/>
  <link href="${atomUrl}" rel="self" type="application/atom+xml"/>
  <updated>${updated}</updated>
${entriesXml}
</feed>
`;
}

async function main() {
    const feedPath = process.argv[2] ?? 'feed-live.json';
    const rssPath = process.argv[3] ?? 'rss.xml';
    const atomPath = process.argv[4] ?? 'atom.xml';

    const raw = JSON.parse(await readFile(feedPath, 'utf8'));
    const feed = FeedSchema.parse(raw);

    const rssContent = generateRss(feed);
    const atomContent = generateAtom(feed);

    await writeFile(rssPath, rssContent);
    await writeFile(atomPath, atomContent);

    console.log(`Generated ${rssPath} and ${atomPath} from ${feedPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
