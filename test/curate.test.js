import test from 'node:test';
import assert from 'node:assert/strict';
import {
    addItemToFeed,
    curateCandidate,
    loadCandidates,
    normalizeCuratedItem,
    normalizeTag,
    normalizeTags,
    runCurateCli,
} from '../scripts/curate.js';

test('normalizeTag and normalizeTags format and deduplicate tags', () => {
    assert.equal(normalizeTag('SFCC Commerce'), 'sfcc-commerce');
    assert.equal(normalizeTag('Developer & Tools!'), 'developer-tools');

    const tags = normalizeTags(['SFCC', 'sfcc', 'PWA Kit', 'Storefront', 'sfcc']);
    assert.deepEqual(tags, ['sfcc', 'pwa-kit', 'storefront']);

    const empty = normalizeTags([]);
    assert.deepEqual(empty, ['commerce']);

    const many = normalizeTags(['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10']);
    assert.equal(many.length, 8);
});

test('normalizeCuratedItem produces a schema-valid article shape', () => {
    const candidate = {
        title: '<b>New Storefront Features</b> in 2026',
        summary: '<p>Learn about the latest updates to SCAPI.</p>',
        url: 'https://developer.salesforce.com/blogs/2026/new-features',
        source: {
            name: 'Salesforce Developers',
            url: 'https://developer.salesforce.com/',
        },
        publishedAt: '2026-09-10T12:00:00.000Z',
        tags: ['SFCC', 'scapi'],
    };

    const item = normalizeCuratedItem(candidate);
    assert.equal(item.type, 'article');
    assert.equal(item.title, 'New Storefront Features in 2026');
    assert.equal(item.summary, 'Learn about the latest updates to SCAPI.');
    assert.equal(item.url, 'https://developer.salesforce.com/blogs/2026/new-features');
    assert.equal(item.source.name, 'Salesforce Developers');
    assert.deepEqual(item.tags, ['sfcc', 'scapi']);
    assert.match(item.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(item.cta.label, 'Read update');
});

test('normalizeCuratedItem rejects invalid URLs', () => {
    assert.throws(
        () => normalizeCuratedItem({ title: 'Test', url: 'http://insecure.example.com' }),
        /must have a valid HTTPS URL/
    );
});

test('addItemToFeed inserts articles below promotions ordered by date', () => {
    const initialFeed = {
        locale: 'en',
        updatedAt: '2026-09-01T00:00:00Z',
        items: [
            {
                id: 'promo-1',
                type: 'promotion',
                title: 'Promo One',
                publishedAt: '2026-09-01T00:00:00Z',
            },
            {
                id: 'article-older',
                type: 'article',
                title: 'Older Article',
                publishedAt: '2026-08-01T00:00:00Z',
                url: 'https://example.com/older',
            },
        ],
    };

    const newItem = {
        id: 'article-newer',
        type: 'article',
        title: 'Newer Article',
        publishedAt: '2026-08-15T00:00:00Z',
        url: 'https://example.com/newer',
    };

    const updated = addItemToFeed(initialFeed, newItem);
    assert.equal(updated.items.length, 3);
    assert.equal(updated.items[0].id, 'promo-1');
    assert.equal(updated.items[1].id, 'article-newer');
    assert.equal(updated.items[2].id, 'article-older');
    assert.ok(Date.parse(updated.updatedAt) > 0);
});

test('addItemToFeed throws on duplicate IDs or duplicate URLs', () => {
    const feed = {
        locale: 'en',
        updatedAt: '2026-09-01T00:00:00Z',
        items: [
            { id: 'item-1', type: 'article', url: 'https://example.com/1', publishedAt: '2026-09-01T00:00:00Z' },
        ],
    };

    assert.throws(
        () => addItemToFeed(feed, { id: 'item-1', type: 'article', url: 'https://example.com/unique', publishedAt: '2026-09-02T00:00:00Z' }),
        /already contains an item with ID/
    );

    assert.throws(
        () => addItemToFeed(feed, { id: 'item-unique', type: 'article', url: 'https://example.com/1', publishedAt: '2026-09-02T00:00:00Z' }),
        /already contains an item with ID/
    );
});

test('curateCandidate accepts, rejects, and skips candidates', async () => {
    const candidate1 = {
        id: 'c-1',
        title: 'Candidate One',
        summary: 'Summary one',
        url: 'https://example.com/c1',
        source: { name: 'Src', url: 'https://example.com/' },
        publishedAt: '2026-09-01T00:00:00Z',
        tags: ['sfcc'],
    };
    const candidate2 = {
        id: 'c-2',
        title: 'Candidate Two',
        summary: 'Summary two',
        url: 'https://example.com/c2',
        source: { name: 'Src', url: 'https://example.com/' },
        publishedAt: '2026-09-02T00:00:00Z',
        tags: ['pwa'],
    };

    const initialFeed = {
        locale: 'en',
        updatedAt: '2026-09-01T00:00:00Z',
        items: [],
    };
    const candidates = [candidate1, candidate2];

    // Accept candidate1
    const accepted = await curateCandidate({
        candidate: candidate1,
        action: 'accept',
        feed: initialFeed,
        candidates,
    });

    assert.equal(accepted.candidates.length, 1);
    assert.equal(accepted.candidates[0].id, 'c-2');
    assert.equal(accepted.feed.items.length, 1);
    assert.equal(accepted.item.id, 'c-1');

    // Reject candidate2
    const rejected = await curateCandidate({
        candidate: candidate2,
        action: 'reject',
        feed: accepted.feed,
        candidates: accepted.candidates,
    });

    assert.equal(rejected.candidates.length, 0);
    assert.equal(rejected.feed.items.length, 1);
});

test('runCurateCli supports --list mode non-interactively', async () => {
    let output = '';
    const mockStdout = {
        write: (str) => { output += str; },
    };

    await runCurateCli(['--list', '--candidates', 'harvested-candidates.json'], {
        stdin: { isTTY: false },
        stdout: mockStdout,
    });

    assert.ok(output.includes('candidate(s) in harvested-candidates.json'));
});
