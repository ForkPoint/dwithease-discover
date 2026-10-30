import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPromotableItems, mergeAndSortFeed, runPromoteCli, selectBatch } from '../scripts/promote-feed.js';

const mockLiveFeed = {
    locale: 'en',
    updatedAt: '2026-09-01T00:00:00Z',
    items: [
        {
            id: 'promo-1',
            type: 'promotion',
            title: 'Sample Promo',
            summary: 'A test promo',
            url: 'https://example.com/promo',
            source: { name: 'Promo', url: 'https://example.com/' },
            publishedAt: '2026-09-01T00:00:00Z',
            tags: ['promo'],
            cta: { label: 'Explore' },
            campaign: {
                id: 'campaign-1',
                startsAt: '2026-09-01T00:00:00Z',
                endsAt: '2026-10-01T00:00:00Z',
                placements: ['discover'],
            },
        },
        {
            id: 'article-1',
            type: 'article',
            title: 'Existing Article',
            summary: 'An existing article',
            url: 'https://example.com/article-1',
            source: { name: 'Source', url: 'https://example.com/' },
            publishedAt: '2026-09-01T00:00:00Z',
            tags: ['commerce'],
            cta: { label: 'Read update' },
        },
    ],
};

test('getPromotableItems finds new editorial items and ignores promotions', () => {
    const devFeed = {
        locale: 'en',
        updatedAt: '2026-09-02T00:00:00Z',
        items: [
            ...mockLiveFeed.items,
            {
                id: 'promo-new',
                type: 'promotion',
                title: 'New Promo',
                summary: 'New promo summary',
                url: 'https://example.com/new-promo',
                source: { name: 'Source', url: 'https://example.com/' },
                publishedAt: '2026-09-02T00:00:00Z',
                tags: ['promo'],
                cta: { label: 'Click' },
                campaign: {
                    id: 'campaign-new',
                    startsAt: '2026-09-01T00:00:00Z',
                    endsAt: '2026-10-01T00:00:00Z',
                    placements: ['discover'],
                },
            },
            {
                id: 'article-new',
                type: 'article',
                title: 'New Article',
                summary: 'A new article summary',
                url: 'https://example.com/article-new',
                source: { name: 'Source', url: 'https://example.com/' },
                publishedAt: '2026-09-02T00:00:00Z',
                tags: ['commerce'],
                cta: { label: 'Read update' },
            },
        ],
    };

    const promotable = getPromotableItems(devFeed, mockLiveFeed);
    assert.equal(promotable.length, 1);
    assert.equal(promotable[0].id, 'article-new');
});

test('mergeAndSortFeed preserves promotions at top and orders editorial by date', () => {
    const newArticles = [
        {
            id: 'article-future',
            type: 'article',
            title: 'Future Article',
            summary: 'Summary future',
            url: 'https://example.com/future',
            source: { name: 'Source', url: 'https://example.com/' },
            publishedAt: '2026-09-15T00:00:00Z',
            tags: ['sfcc'],
            cta: { label: 'Read' },
        },
        {
            id: 'article-past',
            type: 'article',
            title: 'Past Article',
            summary: 'Summary past',
            url: 'https://example.com/past',
            source: { name: 'Source', url: 'https://example.com/' },
            publishedAt: '2026-08-15T00:00:00Z',
            tags: ['sfcc'],
            cta: { label: 'Read' },
        },
    ];

    const result = mergeAndSortFeed(mockLiveFeed, newArticles, '2026-09-16T12:00:00Z');
    assert.equal(result.addedCount, 2);
    assert.equal(result.feed.updatedAt, '2026-09-16T12:00:00Z');

    // Promo first
    assert.equal(result.feed.items[0].type, 'promotion');
    assert.equal(result.feed.items[0].id, 'promo-1');

    // Editorial sorted descending
    assert.equal(result.feed.items[1].id, 'article-future');
    assert.equal(result.feed.items[2].id, 'article-1');
    assert.equal(result.feed.items[3].id, 'article-past');
});

test('runPromoteCli outputs promotable items in --list mode', async () => {
    let output = '';
    const mockStdout = {
        write: (str) => { output += str; },
    };

    await runPromoteCli(['--list'], { stdout: mockStdout });
    assert.ok(output.includes('promotable editorial item(s)'));
});

test('runPromoteCli respects --dry-run without throwing', async () => {
    let output = '';
    const mockStdout = {
        write: (str) => { output += str; },
    };

    await runPromoteCli(['--dry-run'], { stdout: mockStdout });
    assert.ok(output.includes('[Dry run]') || output.includes('No new items'));
});

function editorialItem(id, publishedAt) {
    return {
        id,
        type: 'article',
        title: `Article ${id}`,
        summary: `Summary ${id}`,
        url: `https://example.com/${id}`,
        source: { name: 'Source', url: 'https://example.com/' },
        publishedAt,
        tags: ['commerce'],
        cta: { label: 'Read' },
    };
}

test('selectBatch releases the oldest queued items first', () => {
    const queued = [
        editorialItem('newest', '2026-10-03T00:00:00Z'),
        editorialItem('oldest', '2026-10-01T00:00:00Z'),
        editorialItem('middle', '2026-10-02T00:00:00Z'),
    ];

    assert.deepEqual(selectBatch(queued, 2).map(({ id }) => id), ['oldest', 'middle']);
    assert.equal(selectBatch(queued).length, 3);
});

test('runPromoteCli --limit publishes only one batch per run', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'promote-'));
    const paths = ['dev.json', 'live.json', 'rss.xml', 'atom.xml'].map((name) => join(dir, name));
    const [fromPath, toPath, rssPath, atomPath] = paths;
    const live = { locale: 'en', updatedAt: '2026-10-01T00:00:00Z', items: [] };
    const dev = {
        ...live,
        items: [
            editorialItem('first', '2026-10-01T00:00:00Z'),
            editorialItem('second', '2026-10-02T00:00:00Z'),
            editorialItem('third', '2026-10-03T00:00:00Z'),
        ],
    };
    await writeFile(fromPath, JSON.stringify(dev));
    await writeFile(toPath, JSON.stringify(live));

    const args = ['--from', fromPath, '--to', toPath, '--rss', rssPath, '--atom', atomPath, '--limit', '2'];
    await runPromoteCli(args, { stdout: { write() {} } });
    let published = JSON.parse(await readFile(toPath, 'utf8'));
    assert.deepEqual(published.items.map(({ id }) => id), ['second', 'first']);

    await runPromoteCli(args, { stdout: { write() {} } });
    published = JSON.parse(await readFile(toPath, 'utf8'));
    assert.deepEqual(published.items.map(({ id }) => id), ['third', 'second', 'first']);
});

test('runPromoteCli rejects a limit that is not a positive integer', async () => {
    await assert.rejects(runPromoteCli(['--limit', '0', '--dry-run'], { stdout: { write() {} } }), /--limit/);
});
