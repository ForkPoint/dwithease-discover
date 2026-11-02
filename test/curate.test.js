import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    addItemToFeed,
    curateCandidate,
    loadCandidates,
    loadRejectedUrls,
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

test('normalizeCuratedItem rejects non-English items', () => {
    assert.throws(
        () => normalizeCuratedItem({ title: 'AIエージェント', url: 'https://example.com/jp' }),
        /must be in English/
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

for (const action of ['accept', 'reject']) {
    test(`runCurateCli ${action} preserves other candidates regardless of language`, async () => {
        const directory = await mkdtemp(join(tmpdir(), 'discover-curate-'));
        try {
            const candidatesPath = join(directory, 'candidates.json');
            const feedPath = join(directory, 'feed.json');
            const selected = { id: 'selected', title: 'Commerce release', url: 'https://example.com/release' };
            const remaining = [
                { id: 'mixed', title: 'Support Japanese text (日本語) in storefront search', url: 'https://example.com/search' },
                { id: 'japanese', title: '日本語タイトル', url: 'https://example.com/jp' },
            ];
            await writeFile(candidatesPath, JSON.stringify({ candidates: [selected, ...remaining] }));
            await writeFile(feedPath, JSON.stringify({ locale: 'en', updatedAt: '2026-09-01T00:00:00Z', items: [] }));
            await runCurateCli(['--candidates', candidatesPath, '--feed', feedPath, `--${action}`, selected.id], {
                stdin: { isTTY: false }, stdout: { write() {} },
            });
            assert.deepEqual(JSON.parse(await readFile(candidatesPath, 'utf8')).candidates, remaining);
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
}

test('normalizeCuratedItem rejects Spanish text and accepts English with Japanese terms', () => {
    assert.throws(() => normalizeCuratedItem({
        title: 'Nuevas funciones de comercio para tiendas',
        summary: 'Descubre las novedades para tus clientes.',
        url: 'https://example.com/nuevas-funciones',
    }), /must be in English/);
    assert.equal(normalizeCuratedItem({
        title: 'Support Japanese text (日本語) in storefront search',
        summary: 'This release adds Japanese search support.',
        url: 'https://example.com/search',
    }).title, 'Support Japanese text (日本語) in storefront search');
});

test('runCurateCli records rejected URLs next to the candidates file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'discover-curate-'));
    try {
        const candidatesPath = join(directory, 'candidates.json');
        const feedPath = join(directory, 'feed.json');
        const rejectedPath = join(directory, 'rejected-candidates.json');
        const candidates = [
            { id: 'first', title: 'First', url: 'https://example.com/first' },
            { id: 'second', title: 'Second', url: 'https://example.com/second' },
        ];
        await writeFile(candidatesPath, JSON.stringify({ candidates }));
        await writeFile(feedPath, JSON.stringify({ locale: 'en', updatedAt: '2026-09-01T00:00:00Z', items: [] }));
        const run = (id) => runCurateCli(['--candidates', candidatesPath, '--feed', feedPath, '--reject', id], {
            stdin: { isTTY: false }, stdout: { write() {} },
        });

        await run('first');
        await run('second');

        assert.deepEqual(await loadRejectedUrls(rejectedPath), new Set([
            'https://example.com/first',
            'https://example.com/second',
        ]));
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('loadRejectedUrls returns an empty set when no file exists', async () => {
    assert.deepEqual(await loadRejectedUrls(join(tmpdir(), 'missing-rejected-candidates.json')), new Set());
});
