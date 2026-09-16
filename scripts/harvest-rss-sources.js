import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const COMMERCE_KEYWORDS = [
    'commerce',
    'b2c',
    'sfcc',
    'pwa',
    'pwa-kit',
    'storefront',
    'composable',
    'agentforce',
    'agentic',
    'retail',
    'cart',
    'checkout',
];

export function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 100) || 'candidate-item';
}

export function cleanText(text) {
    if (!text) return '';
    return text
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

export function parseAtomEntries(xmlString) {
    const entries = [];
    const entryBlocks = xmlString.match(/<entry[\s\S]*?<\/entry>/gi) || [];

    for (const block of entryBlocks) {
        const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const linkMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>(?:<\/link>)?/i)
            || block.match(/<link>([^<]+)<\/link>/i);
        const updatedMatch = block.match(/<(?:updated|published)[^>]*>([\s\S]*?)<\/(?:updated|published)>/i);
        const summaryMatch = block.match(/<(?:summary|content)[^>]*>([\s\S]*?)<\/(?:summary|content)>/i);

        const title = cleanText(titleMatch ? titleMatch[1] : '');
        const url = linkMatch ? linkMatch[1].trim() : '';
        const publishedAt = updatedMatch ? updatedMatch[1].trim() : new Date().toISOString();
        const rawSummary = cleanText(summaryMatch ? summaryMatch[1] : '');
        const summary = rawSummary.slice(0, 260) || title;

        if (title && url) {
            entries.push({ title, url, publishedAt, summary });
        }
    }

    return entries;
}

export function parseRssItems(xmlString) {
    const items = [];
    const itemBlocks = xmlString.match(/<item[\s\S]*?<\/item>/gi) || [];

    for (const block of itemBlocks) {
        const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
        const dateMatch = block.match(/<(?:pubDate|dc:date)[^>]*>([\s\S]*?)<\/(?:pubDate|dc:date)>/i);
        const descMatch = block.match(/<(?:description|content:encoded)[^>]*>([\s\S]*?)<\/(?:description|content:encoded)>/i);
        const categoryMatches = [...block.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map((m) => cleanText(m[1]));

        const title = cleanText(titleMatch ? titleMatch[1] : '');
        const url = linkMatch ? cleanText(linkMatch[1]) : '';
        let publishedAt;
        try {
            publishedAt = dateMatch ? new Date(cleanText(dateMatch[1])).toISOString() : new Date().toISOString();
        } catch {
            publishedAt = new Date().toISOString();
        }
        const rawSummary = cleanText(descMatch ? descMatch[1] : '');
        const summary = rawSummary.slice(0, 260) || title;

        if (title && url) {
            items.push({
                title,
                url,
                publishedAt,
                summary,
                categories: categoryMatches,
            });
        }
    }

    return items;
}

export function matchesKeywords(text, keywords = COMMERCE_KEYWORDS) {
    const lower = text.toLowerCase();
    return keywords.some((kw) => lower.includes(kw));
}

export function normalizeCandidate(entry, source, defaultTags = ['sfcc', 'commerce']) {
    return {
        id: slugify(`${source.name}-${entry.title}`),
        type: 'article',
        title: entry.title.slice(0, 120),
        summary: (entry.summary || entry.title).slice(0, 280),
        url: entry.url,
        source: {
            name: source.name,
            url: source.url,
        },
        publishedAt: entry.publishedAt,
        tags: defaultTags,
        cta: {
            label: 'Read update',
        },
    };
}

export function mergeCandidates(existingCandidates = [], newEntries = [], knownUrls = new Set()) {
    const seenUrls = new Set([...knownUrls]);
    const seenIds = new Set(existingCandidates.map((c) => c.id));
    existingCandidates.forEach((c) => seenUrls.add(c.url));

    const additions = [];
    for (const item of newEntries) {
        if (!seenUrls.has(item.url) && !seenIds.has(item.id)) {
            seenUrls.add(item.url);
            seenIds.add(item.id);
            additions.push(item);
        }
    }

    return {
        additions,
        candidates: [...additions, ...existingCandidates],
    };
}

const RSS_SOURCES = [
    {
        name: 'PWA Kit Releases',
        url: 'https://github.com/SalesforceCommerceCloud/pwa-kit/releases.atom',
        feedUrl: 'https://github.com/SalesforceCommerceCloud/pwa-kit/releases.atom',
        type: 'atom',
        tags: ['pwa-kit', 'release-notes', 'sfcc'],
        filter: (entry) => !entry.url.includes('nightly') && !entry.title.toLowerCase().includes('nightly'),
    },
    {
        name: 'Salesforce Developers Blog',
        url: 'https://developer.salesforce.com/blogs/feed',
        feedUrl: 'https://developer.salesforce.com/blogs/feed',
        type: 'rss',
        tags: ['sfcc', 'developer-tools', 'salesforce'],
        filter: (entry) => matchesKeywords(`${entry.title} ${entry.summary} ${(entry.categories || []).join(' ')}`),
    },
    {
        name: 'Salesforce Commerce Blog',
        url: 'https://www.salesforce.com/blog/category/ecommerce/',
        feedUrl: 'https://www.salesforce.com/blog/category/ecommerce/feed/',
        type: 'rss',
        tags: ['sfcc', 'strategy', 'ecommerce'],
        filter: () => true,
    },
];

export async function harvestFromSources(sources = RSS_SOURCES, fetchImpl = fetch) {
    const harvested = [];

    for (const source of sources) {
        try {
            const res = await fetchImpl(source.feedUrl, {
                headers: { 'User-Agent': 'DWithEase-Discover-Harvester/1.0' },
            });
            if (!res.ok) {
                console.warn(`Could not fetch ${source.name} (${res.status})`);
                continue;
            }
            const text = await res.text();
            const entries = source.type === 'atom' ? parseAtomEntries(text) : parseRssItems(text);
            const filtered = source.filter ? entries.filter(source.filter) : entries;
            for (const entry of filtered.slice(0, 5)) {
                harvested.push(normalizeCandidate(entry, source, source.tags));
            }
        } catch (err) {
            console.warn(`Error harvesting ${source.name}:`, err.message);
        }
    }

    return harvested;
}

async function main() {
    const candidatesPath = process.argv[2] ?? 'harvested-candidates.json';
    let existingData = { harvestedAt: new Date().toISOString(), candidates: [] };

    try {
        existingData = JSON.parse(await readFile(candidatesPath, 'utf8'));
    } catch {
        // File may not exist yet
    }

    const knownUrls = new Set();
    for (const feedFile of ['feed-dev.json', 'feed-live.json']) {
        try {
            const feed = JSON.parse(await readFile(feedFile, 'utf8'));
            (feed.items || []).forEach((item) => knownUrls.add(item.url));
        } catch {
            // Optional feed files
        }
    }

    const newCandidates = await harvestFromSources();
    const result = mergeCandidates(existingData.candidates, newCandidates, knownUrls);

    if (result.additions.length === 0) {
        console.log('RSS Harvester: No new candidate articles found.');
        return;
    }

    const output = {
        harvestedAt: new Date().toISOString(),
        candidates: result.candidates,
    };

    await writeFile(candidatesPath, `${JSON.stringify(output, null, 2)}\n`);
    console.log(`RSS Harvester: Added ${result.additions.length} new candidates to ${candidatesPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
