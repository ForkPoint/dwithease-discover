import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    cleanText,
    harvestFromSources,
    isEnglish,
    isSfccRelated,
    loadRejectedUrls,
    mergeCandidates,
    normalizeCandidate,
    parseAtomEntries,
    parseRssItems,
    recordRejection,
    rejectedPathFor,
    slugify,
} from '../scripts/harvest-rss-sources.js';

test('slugify generates valid slugs', () => {
    assert.equal(slugify('PWA Kit v3.5.0 Release!'), 'pwa-kit-v3-5-0-release');
    assert.equal(slugify('Salesforce & AI: The Future'), 'salesforce-ai-the-future');
    assert.match(slugify('Test Title'), /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});

test('cleanText strips CDATA and HTML tags', () => {
    assert.equal(cleanText('<![CDATA[<b>Hello</b> &amp; World]]>'), 'Hello & World');
    assert.equal(cleanText('<p>Article text with <a href="#">link</a></p>'), 'Article text with link');
    assert.equal(cleanText('&#65;&#66;&#67; and &#x44;&#x45;'), 'ABC and DE');
});

test('parseAtomEntries parses Atom XML entries', () => {
    const atomXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>PWA Kit Releases</title>
  <entry>
    <id>tag:github.com,2008:Repository/123/v3.5.0</id>
    <updated>2026-08-20T10:00:00Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/SalesforceCommerceCloud/pwa-kit/releases/tag/v3.5.0"/>
    <title>v3.5.0 Release</title>
    <content type="html">&lt;p&gt;Performance improvements for Retail React App.&lt;/p&gt;</content>
  </entry>
  <entry>
    <id>tag:github.com,2008:Repository/123/v3.5.1-nightly</id>
    <updated>2026-08-21T10:00:00Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/SalesforceCommerceCloud/pwa-kit/releases/tag/v3.5.1-nightly"/>
    <title>v3.5.1-nightly</title>
    <content type="html">Nightly test build</content>
  </entry>
</feed>`;

    const entries = parseAtomEntries(atomXml);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].title, 'v3.5.0 Release');
    assert.equal(entries[0].url, 'https://github.com/SalesforceCommerceCloud/pwa-kit/releases/tag/v3.5.0');
    assert.equal(entries[0].publishedAt, '2026-08-20T10:00:00Z');
    assert.match(entries[0].summary, /Performance improvements/);
});

test('parseRssItems parses RSS 2.0 XML items', () => {
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Salesforce Developers</title>
    <item>
      <title>Building Headless Commerce with PWA Kit and B2C Commerce</title>
      <link>https://developer.salesforce.com/blogs/2026/08/pwa-kit-headless</link>
      <pubDate>Mon, 18 Aug 2026 12:00:00 GMT</pubDate>
      <description><![CDATA[Learn how to configure SCAPI and PWA Kit for maximum speed.]]></description>
      <category>Commerce</category>
      <category>Developer Tools</category>
    </item>
  </channel>
</rss>`;

    const items = parseRssItems(rssXml);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'Building Headless Commerce with PWA Kit and B2C Commerce');
    assert.equal(items[0].url, 'https://developer.salesforce.com/blogs/2026/08/pwa-kit-headless');
    assert.deepEqual(items[0].categories, ['Commerce', 'Developer Tools']);
    assert.match(items[0].summary, /Learn how to configure SCAPI/);
});

test('normalizeCandidate forms valid candidate shape', () => {
    const candidate = normalizeCandidate(
        {
            title: 'Composable Storefront Guide',
            url: 'https://example.com/guide',
            publishedAt: '2026-08-20T00:00:00Z',
            summary: 'Comprehensive overview of composable architecture.',
        },
        { name: 'Salesforce Developers', url: 'https://developer.salesforce.com/blogs' },
        ['sfcc', 'pwa-kit'],
    );

    assert.equal(candidate.type, 'article');
    assert.equal(candidate.title, 'Composable Storefront Guide');
    assert.equal(candidate.url, 'https://example.com/guide');
    assert.deepEqual(candidate.tags, ['sfcc', 'pwa-kit']);
    assert.equal(candidate.cta.label, 'Read update');
});

test('mergeCandidates deduplicates by URL and ID', () => {
    const existing = [
        { id: 'item-1', url: 'https://example.com/1', title: 'Item 1' },
    ];
    const incoming = [
        { id: 'item-1', url: 'https://example.com/1', title: 'Item 1' },
        { id: 'item-2', url: 'https://example.com/2', title: 'Item 2' },
    ];
    const knownUrls = new Set(['https://example.com/already-in-feed']);

    const result = mergeCandidates(existing, incoming, knownUrls);
    assert.equal(result.additions.length, 1);
    assert.equal(result.additions[0].id, 'item-2');
    assert.equal(result.candidates.length, 2);
});

test('harvestFromSources fetches and filters mock feeds', async () => {
    const mockAtom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>v3.6.0</title>
    <link href="https://example.com/v3.6.0"/>
    <updated>2026-09-01T00:00:00Z</updated>
    <content>Release notes for v3.6.0</content>
  </entry>
  <entry>
    <title>v3.6.1-nightly</title>
    <link href="https://example.com/nightly"/>
    <updated>2026-09-02T00:00:00Z</updated>
    <content>Nightly build</content>
  </entry>
</feed>`;

    const mockFetch = async () => ({
        ok: true,
        text: async () => mockAtom,
    });

    const sources = [{
        name: 'PWA Kit',
        url: 'https://github.com/SalesforceCommerceCloud/pwa-kit',
        feedUrl: 'https://example.com/releases.atom',
        type: 'atom',
        tags: ['pwa-kit'],
        filter: (entry) => !entry.url.includes('nightly'),
    }];

    const candidates = await harvestFromSources(sources, mockFetch);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].title, 'v3.6.0');
});

test('isEnglish identifies English content and rejects non-English or localized URLs', () => {
    assert.equal(isEnglish({ title: 'New Storefront Features', url: 'https://example.com/features' }), true);
    assert.equal(isEnglish({ title: '日本語タイトル', url: 'https://example.com/post' }), false);
    assert.equal(isEnglish({ title: 'English Title', url: 'https://developer.salesforce.com/blogs/2026/09/post-jp' }), false);
    assert.equal(isEnglish({ title: 'English Title', summary: '概要説明', url: 'https://example.com/post' }), false);
    assert.equal(isEnglish(null), false);
});

test('isEnglish rejects Latin-script languages and accepts English with Japanese terms', () => {
    for (const entry of [
        { title: 'Nuevas funciones de comercio para tiendas', summary: 'Descubre las novedades para tus clientes.' },
        { title: 'Découvrez les nouvelles fonctionnalités du commerce', summary: 'Cette mise à jour améliore la recherche dans votre boutique.' },
        { title: 'Neue Funktionen für den Handel', summary: 'Diese Veröffentlichung verbessert die Suche in Ihrem Online-Shop.' },
    ]) assert.equal(isEnglish({ ...entry, url: 'https://example.com/post' }), false);
    assert.equal(isEnglish({
        title: 'Support Japanese text (日本語) in storefront search',
        summary: 'This release adds Japanese search support.',
        url: 'https://example.com/search',
    }), true);
    assert.equal(isEnglish({ title: 'v3.6.0', summary: 'Release notes', url: 'https://example.com/v3.6.0' }), true);
    assert.equal(isEnglish({ title: 'Commerce release', url: 'https://example.com/post?lang=ja' }), false);
});

test('rejected URLs block a candidate from being harvested again', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'discover-rejected-'));
    try {
        const rejectedPath = rejectedPathFor(join(directory, 'harvested-candidates.json'));
        await recordRejection(rejectedPath, 'https://example.com/off-topic');
        const knownUrls = await loadRejectedUrls(rejectedPath);
        const entry = { id: 'off-topic', title: 'Off topic', url: 'https://example.com/off-topic' };

        assert.equal(mergeCandidates([], [entry], knownUrls).additions.length, 0);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('isSfccRelated keeps B2C Commerce posts and drops general Salesforce or small-business posts', () => {
    const keep = [
        { title: 'Stop Credential Stuffing with B2C Commerce eCDN', summary: '', url: 'https://developer.salesforce.com/blogs/2026/10/stop-credential-stuffing-with-b2c-commerce-ecdn' },
        { title: 'Peak-Ready Precision: The October 2026 B2C Commerce Release', summary: '', url: 'https://www.salesforce.com/blog/b2c-commerce-october-26-release/' },
        { title: 'Turn TikTok Scrolls into Sales', summary: '', url: 'https://www.salesforce.com/blog/commerce-cloud-tiktok-integration/' },
        { title: 'Bot Mitigation in the Age of AI Crawlers', summary: 'Protect your storefront from scrapers.', url: 'https://www.salesforce.com/blog/bot-mitigation-strategy/' },
    ];
    const drop = [
        { title: 'Agentforce Voice for Agent Script: Route Real Phone Calls to Your Agent', summary: 'Omni-Channel routing', url: 'https://developer.salesforce.com/blogs/2026/10/agentforce-voice' },
        { title: 'Pro-Code Chunking of Data 360 Search Indexes for Agentforce', summary: '', url: 'https://developer.salesforce.com/blogs/2026/09/pro-code-chunking' },
        { title: '25 Online Business Ideas For All Your Commerce Needs', summary: 'turn a spare evening into a real storefront', url: 'https://www.salesforce.com/blog/small-business/online-business-ideas-for-commerce/' },
    ];

    for (const entry of keep) assert.equal(isSfccRelated(entry), true, entry.title);
    for (const entry of drop) assert.equal(isSfccRelated(entry), false, entry.title);
});
