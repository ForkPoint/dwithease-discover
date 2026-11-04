import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { francAll } from 'franc-min';

// Terms that tie a post to Salesforce B2C Commerce (SFCC), not to Salesforce in general.
const SFCC_KEYWORDS = [
    'b2c commerce',
    'b2c-commerce',
    'commerce cloud',
    'commerce-cloud',
    'sfcc',
    'sfra',
    'pwa kit',
    'pwa-kit',
    'composable storefront',
    'storefront',
    'ecdn',
    'scapi',
    'ocapi',
    'managed runtime',
]

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

export function stripMarkdown(text) {
    return (text || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/:[a-z0-9_+-]+:/g, ' ')
        .replace(/[#*_`>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Reads the GitHub Releases API, which lists stable releases that the Atom feed pushes out with nightly builds.
export function parseGithubReleases(jsonText) {
    const releases = JSON.parse(jsonText);
    if (!Array.isArray(releases)) return [];
    return releases
        .filter((release) => !release.draft && !release.prerelease && release.html_url && release.published_at)
        .map((release) => {
            const title = cleanText(release.name || release.tag_name);
            return {
                title,
                url: release.html_url,
                publishedAt: new Date(release.published_at).toISOString(),
                summary: stripMarkdown(release.body).slice(0, 260) || title,
            };
        });
}

export function matchesKeywords(text, keywords = SFCC_KEYWORDS) {
    const lower = text.toLowerCase();
    return keywords.some((kw) => lower.includes(kw));
}

export function isSfccRelated(entry) {
    // Small-business posts reuse commerce words but are not about the platform.
    if (entry.url.includes('/small-business/')) return false;
    return matchesKeywords(`${entry.title} ${entry.summary ?? ''} ${entry.url} ${(entry.categories || []).join(' ')}`);
}

// Real non-English text scores English near 0.65; misread English scores above 0.9.
const ENGLISH_MIN_SCORE = 0.85;

export function isEnglish(entry) {
    if (!entry) return false;
    try {
        const url = new URL(entry.url);
        if (/(?:-|\/)(?:jp|ja|cn|zh|ko|es|fr|de|pt|ru)(?:$|\/)/i.test(url.pathname)) return false;
        for (const key of ['lang', 'language', 'locale']) {
            const language = url.searchParams.get(key);
            if (language && !/^en(?:[-_]|$)/i.test(language)) return false;
        }
    } catch {
        // Text-only entries can still be checked before URL validation.
    }
    const fields = [cleanText(entry.title || ''), cleanText(entry.summary || '')];
    for (const text of fields) {
        const latinLetters = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
        const otherLetters = text.match(/(?!\p{Script=Latin})\p{Letter}/gu)?.length ?? 0;
        // Allow foreign terms in English text, but reject predominantly foreign scripts.
        if (otherLetters > latinLetters) return false;
    }
    // Short release names do not provide enough text for reliable detection.
    const scores = francAll([...new Set(fields)].join(' '), { minLength: 40 });
    if (scores[0][0] === 'und') return true;
    // Short English text can score slightly higher as French or Spanish, so accept close runners-up.
    const english = scores.find(([language]) => language === 'eng');
    return (english?.[1] ?? 0) >= ENGLISH_MIN_SCORE;
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

// Rejections live beside the candidates file so the harvester can skip them on later runs.
export function rejectedPathFor(candidatesPath) {
    return join(dirname(candidatesPath), 'rejected-candidates.json');
}

export async function loadRejectedUrls(filePath) {
    try {
        const parsed = JSON.parse(await readFile(filePath, 'utf8'));
        return new Set(parsed.urls ?? []);
    } catch {
        return new Set();
    }
}

export async function recordRejection(filePath, url) {
    const urls = await loadRejectedUrls(filePath);
    urls.add(url);
    await writeFile(filePath, `${JSON.stringify({ urls: [...urls].sort() }, null, 2)}\n`);
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

// The extension hides items whose publishedAt is older than this, so older items are never auto-queued.
export const EXTENSION_WINDOW_DAYS = 60;

const RSS_SOURCES = [
    {
        name: 'PWA Kit Releases',
        url: 'https://github.com/SalesforceCommerceCloud/pwa-kit/releases.atom',
        feedUrl: 'https://api.github.com/repos/SalesforceCommerceCloud/pwa-kit/releases?per_page=30',
        type: 'github-releases',
        tags: ['pwa-kit', 'release-notes', 'sfcc'],
        filter: (entry) => !entry.url.includes('nightly') && !entry.title.toLowerCase().includes('nightly'),
        titlePrefix: 'PWA Kit ',
        // Official SFCC releases skip review and go straight to the publish queue.
        autoAccept: true,
    },
    {
        name: 'Salesforce Developers Blog',
        url: 'https://developer.salesforce.com/blogs/feed',
        feedUrl: 'https://developer.salesforce.com/blogs/feed',
        type: 'rss',
        tags: ['sfcc', 'developer-tools', 'salesforce'],
        filter: isSfccRelated,
    },
    {
        name: 'Salesforce Commerce Blog',
        url: 'https://www.salesforce.com/blog/category/ecommerce/',
        feedUrl: 'https://www.salesforce.com/blog/category/ecommerce/feed/',
        type: 'rss',
        tags: ['sfcc', 'strategy', 'ecommerce'],
        filter: isSfccRelated,
    },
];

// Failed fetches and feeds with no parsable entries are pushed to `failures`
// so the caller can fail the run instead of silently harvesting nothing.
export async function harvestFromSources(sources = RSS_SOURCES, fetchImpl = fetch, failures = []) {
    const harvested = [];

    for (const source of sources) {
        try {
            const headers = { 'User-Agent': 'DWithEase-Discover-Harvester/1.0' };
            if (source.type === 'github-releases' && process.env.GITHUB_TOKEN) {
                headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
            }
            const res = await fetchImpl(source.feedUrl, { headers });
            if (!res.ok) {
                failures.push(`${source.name}: HTTP ${res.status}`);
                continue;
            }
            const text = await res.text();
            const parse = { atom: parseAtomEntries, 'github-releases': parseGithubReleases }[source.type] ?? parseRssItems;
            const entries = parse(text);
            if (entries.length === 0) {
                failures.push(`${source.name}: no entries parsed`);
                continue;
            }
            const englishEntries = entries.filter(isEnglish);
            const filtered = source.filter ? englishEntries.filter(source.filter) : englishEntries;
            for (const entry of filtered.slice(0, 5)) {
                const title = source.titlePrefix && !entry.title.startsWith(source.titlePrefix)
                    ? `${source.titlePrefix}${entry.title}`
                    : entry.title;
                harvested.push(normalizeCandidate({ ...entry, title }, source, source.tags));
            }
        } catch (err) {
            failures.push(`${source.name}: ${err.message}`);
        }
    }

    return harvested;
}

async function readJson(filePath, fallback) {
    try {
        return JSON.parse(await readFile(filePath, 'utf8'));
    } catch {
        return fallback;
    }
}

async function queueTrustedItems({ feedPath, sources, fetchImpl, knownUrls, log }) {
    // Imported lazily because curate.js imports this module.
    const { addItemToFeed, normalizeCuratedItem } = await import('./curate.js');
    const failures = [];
    const oldest = Date.now() - EXTENSION_WINDOW_DAYS * 86_400_000;
    const items = (await harvestFromSources(sources, fetchImpl, failures))
        .filter(({ url, publishedAt }) => !knownUrls.has(url) && Date.parse(publishedAt) >= oldest);

    if (items.length === 0) {
        log('RSS Harvester: No new trusted items to queue.');
    } else {
        let feed = await readJson(feedPath, null);
        for (const item of items) feed = addItemToFeed(feed, normalizeCuratedItem(item));
        await writeFile(feedPath, `${JSON.stringify(feed, null, 2)}\n`);
        log(`RSS Harvester: Queued ${items.length} trusted item(s) in ${feedPath}`);
    }

    if (failures.length > 0) {
        throw new Error(`RSS Harvester: ${failures.length} source(s) failed:\n${failures.join('\n')}`);
    }
    return { additions: items };
}

export async function runHarvestCli(
    args = process.argv.slice(2),
    { sources = RSS_SOURCES, fetchImpl = fetch, log = console.log } = {},
) {
    let candidatesPath = 'harvested-candidates.json';
    let previousPath = null;
    let trustedOnly = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--previous' && args[i + 1]) previousPath = args[++i];
        else if (args[i] === '--trusted-only') trustedOnly = true;
        else if (!args[i].startsWith('--')) candidatesPath = args[i];
    }

    // Feeds and the rejection list sit beside the candidates file.
    const directory = dirname(candidatesPath);
    const existingData = await readJson(candidatesPath, { candidates: [] });
    const knownUrls = new Set();
    for (const feedFile of ['feed-dev.json', 'feed-live.json']) {
        const feed = await readJson(join(directory, feedFile), { items: [] });
        (feed.items || []).forEach((item) => knownUrls.add(item.url));
    }
    for (const url of await loadRejectedUrls(rejectedPathFor(candidatesPath))) knownUrls.add(url);

    if (trustedOnly) {
        return queueTrustedItems({
            feedPath: join(directory, 'feed-dev.json'),
            sources: sources.filter(({ autoAccept }) => autoAccept),
            fetchImpl,
            knownUrls,
            log,
        });
    }

    // Candidates from an unmerged bot branch are carried over so a rebuilt branch loses nothing.
    const previous = previousPath ? (await readJson(previousPath, { candidates: [] })).candidates ?? [] : [];

    const failures = [];
    const harvestedAt = new Date().toISOString();
    const newCandidates = (await harvestFromSources(sources.filter(({ autoAccept }) => !autoAccept), fetchImpl, failures))
        .map((candidate) => ({ ...candidate, harvestedAt }));
    const result = mergeCandidates(existingData.candidates, [...previous, ...newCandidates], knownUrls);

    if (result.additions.length === 0) {
        log('RSS Harvester: No new candidate articles found.');
    } else {
        const output = {
            harvestedAt,
            candidates: result.candidates,
        };
        await writeFile(candidatesPath, `${JSON.stringify(output, null, 2)}\n`);
        log(`RSS Harvester: Added ${result.additions.length} new candidates to ${candidatesPath}`);
    }

    if (failures.length > 0) {
        throw new Error(`RSS Harvester: ${failures.length} source(s) failed:\n${failures.join('\n')}`);
    }
    return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await runHarvestCli();
}
