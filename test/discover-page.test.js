import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

import {
    renderCatalog,
    renderError,
    startDiscoverPage,
} from '../assets/discover-page.js';

function createRoot() {
    const { document } = parseHTML(`
        <base href="https://discover.example/">
        <main id="discover-content"></main>
    `);
    return document.getElementById('discover-content');
}

const PROMOTION = {
    id: 'catalogspark-2026',
    type: 'promotion',
    title: 'Make product data ready',
    summary: 'Prepare product data for every commerce channel.',
    url: 'https://catalogspark.com/',
    source: {
        name: 'CatalogSpark',
        url: 'https://catalogspark.com/',
    },
    publishedAt: '2026-09-01T00:00:00Z',
    tags: ['product-data'],
    cta: {
        label: 'Explore CatalogSpark',
    },
    campaign: {
        id: 'catalogspark-2026',
        startsAt: '2026-09-01T00:00:00Z',
        endsAt: '2026-10-01T00:00:00Z',
        placements: ['discover'],
    },
};

test('renders promotions and editorial items with useful metadata', () => {
    const root = createRoot();
    const unsafeTitle = '<img src=x onerror=alert(1)>';
    const article = {
        id: 'commerce-news',
        type: 'article',
        title: unsafeTitle,
        summary: 'A useful commerce update.',
        url: 'https://example.com/article',
        source: {
            name: 'Commerce Source',
            url: 'https://example.com/',
        },
        publishedAt: '2026-08-30T00:00:00Z',
        tags: ['sfcc', 'commerce'],
        cta: {
            label: 'Read article',
        },
    };

    const sources = new Map([[
        'https://example.com/',
        { icon: 'https://discover.example/assets/sources/example.svg' },
    ]]);
    renderCatalog(root, {
        promotions: [PROMOTION],
        editorial: [article],
    }, sources);

    assert.deepEqual(
        [...root.querySelectorAll('[data-section-title]')].map((node) => node.textContent),
        ['Featured tools', 'Latest from commerce'],
    );
    assert.equal(root.querySelector('[data-item-id="commerce-news"] h3').textContent, unsafeTitle);
    assert.equal(root.querySelector('[data-item-id="commerce-news"] h3 img'), null);
    assert.match(root.querySelector('[data-item-id="commerce-news"]').textContent, /Commerce Source/);
    assert.match(root.querySelector('[data-item-id="commerce-news"]').textContent, /Aug 30, 2026/);
    assert.equal(
        root.querySelector('[data-item-id="commerce-news"] .source-icon').getAttribute('src'),
        'https://discover.example/assets/sources/example.svg',
    );
    assert.equal(
        root.querySelector('[data-item-id="catalogspark-2026"] .source-icon').getAttribute('src'),
        'assets/sources/source-fallback.svg',
    );
    assert.equal(
        root.querySelector('[data-item-id="commerce-news"] .source-icon').getAttribute('width'),
        '28',
    );
    assert.deepEqual(
        [...root.querySelectorAll('[data-item-id="commerce-news"] .tag')].map((node) => node.textContent),
        ['sfcc', 'commerce'],
    );
    assert.equal(
        root.querySelector('[data-item-id="catalogspark-2026"] a').getAttribute('href'),
        'https://catalogspark.com/',
    );
});

test('renders the Discover empty state', () => {
    const root = createRoot();

    renderCatalog(root, { promotions: [], editorial: [] });

    assert.match(root.textContent, /There are no articles or tools to discover right now/);
    assert.equal(root.querySelector('[data-testid="discover-empty"]').getAttribute('role'), 'status');
});

test('does not render actions for raw non-RFC URLs', () => {
    const root = createRoot();

    for (const url of [
        'https://catalogspark.com/\t',
        'https://catalogspark.com\\audit',
        'https://user@catalogspark.com/audit',
        'https://a@b@catalogspark.com/audit',
        'https://catalogspark.com:65536/audit',
    ]) {
        renderCatalog(root, {
            promotions: [{ ...PROMOTION, url }],
            editorial: [],
        });

        assert.equal(root.querySelector('[data-item-id="catalogspark-2026"] a'), null);
    }
});

test('renders a working retry action after a feed error', () => {
    const root = createRoot();
    let retries = 0;

    renderError(root, () => { retries += 1; });
    root.querySelector('button').click();

    assert.match(root.textContent, /Discover could not load/);
    assert.equal(root.querySelector('.error-state').getAttribute('role'), 'alert');
    assert.equal(retries, 1);
});

test('loads only the selected feed', async () => {
    const root = createRoot();
    const requests = [];
    const fetchImpl = async (url) => {
        requests.push(url);
        if (url === 'sources.json') {
            return {
                ok: true,
                url: 'https://discover.example/sources.json',
                json: async () => ({
                    sources: [{
                        name: 'CatalogSpark',
                        url: 'https://catalogspark.com/',
                        icon: 'assets/sources/catalogspark.ico',
                    }],
                }),
            };
        }
        return {
            ok: true,
            json: async () => ({
                locale: 'en',
                updatedAt: '2026-09-01T00:00:00Z',
                items: [PROMOTION],
            }),
        };
    };

    await startDiscoverPage({
        root,
        search: '?feed=dev',
        fetchImpl,
        now: Date.parse('2026-09-10T12:00:00Z'),
        pageUrl: 'https://discover.example/',
    });
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(requests, ['feed-dev.json', 'sources.json']);
    assert.ok(root.querySelector('[data-item-id="catalogspark-2026"]'));
    assert.equal(
        root.querySelector('[data-item-id="catalogspark-2026"] .source-icon').getAttribute('src'),
        'https://discover.example/assets/sources/catalogspark.ico',
    );
});

test('keeps feed text when the source registry fails', async () => {
    const root = createRoot();
    const fetchImpl = async (url) => {
        if (url === 'sources.json') throw new Error('Source registry unavailable');
        return {
            ok: true,
            json: async () => ({
                locale: 'en',
                updatedAt: '2026-09-01T00:00:00Z',
                items: [PROMOTION],
            }),
        };
    };

    await startDiscoverPage({
        root,
        fetchImpl,
        now: Date.parse('2026-09-10T12:00:00Z'),
        pageUrl: 'https://discover.example/',
    });

    assert.match(root.textContent, /Make product data ready/);
    assert.equal(
        root.querySelector('.source-icon').getAttribute('src'),
        'assets/sources/source-fallback.svg',
    );
});

test('renders card titles as links and renders topic filters for multi-item editorial feeds', () => {
    const root = createRoot();
    const articles = [
        {
            id: 'sfcc-guide',
            type: 'article',
            title: 'SFCC Developer Guide',
            summary: 'A deep dive into SFCC.',
            url: 'https://example.com/sfcc-guide',
            source: { name: 'Source', url: 'https://example.com/' },
            publishedAt: '2026-09-02T00:00:00Z',
            tags: ['sfcc', 'developer-tools'],
            cta: { label: 'Read guide' },
        },
        {
            id: 'pwa-guide',
            type: 'article',
            title: 'PWA Kit Architecture',
            summary: 'Headless storefront overview.',
            url: 'https://example.com/pwa-guide',
            source: { name: 'Source', url: 'https://example.com/' },
            publishedAt: '2026-09-01T00:00:00Z',
            tags: ['pwa-kit'],
            cta: { label: 'Explore architecture' },
        },
    ];

    renderCatalog(root, { promotions: [PROMOTION], editorial: articles });

    const titleLink = root.querySelector('[data-item-id="sfcc-guide"] .card-title a');
    assert.ok(titleLink);
    assert.equal(titleLink.getAttribute('href'), 'https://example.com/sfcc-guide');
    assert.equal(titleLink.getAttribute('target'), '_blank');
    assert.equal(titleLink.textContent, 'SFCC Developer Guide');

    // Promotion card eyebrow
    assert.equal(root.querySelector('[data-item-id="catalogspark-2026"] .eyebrow-featured').textContent, 'Featured Tool');

    // Filter bar
    const filterBar = root.querySelector('.filter-bar');
    assert.ok(filterBar);
    const pills = [...filterBar.querySelectorAll('.filter-pill')];
    assert.ok(pills.some((p) => p.dataset.filter === 'sfcc'));
    assert.ok(pills.some((p) => p.dataset.filter === 'pwa-kit'));

    // Filter by PWA Kit
    const pwaPill = pills.find((p) => p.dataset.filter === 'pwa-kit');
    pwaPill.click();

    assert.equal(root.querySelector('[data-item-id="sfcc-guide"]').hidden, true);
    assert.equal(root.querySelector('[data-item-id="pwa-guide"]').hidden, false);

    // Clicking SFCC tag on a card triggers SFCC filter
    const sfccTag = root.querySelector('[data-item-id="sfcc-guide"] [data-tag="sfcc"]');
    sfccTag.click();

    assert.equal(root.querySelector('[data-item-id="sfcc-guide"]').hidden, false);
    assert.equal(root.querySelector('[data-item-id="pwa-guide"]').hidden, true);

    // Share button
    const shareBtn = root.querySelector('[data-item-id="sfcc-guide"] .card-share-btn');
    assert.ok(shareBtn);
    assert.equal(shareBtn.getAttribute('aria-label'), 'Copy link to this card');
});

test('filters articles by search input query and clears search', () => {
    const root = createRoot();
    const articles = [
        {
            id: 'sfcc-guide',
            type: 'article',
            title: 'SFCC Developer Guide',
            summary: 'A deep dive into Commerce Cloud.',
            url: 'https://example.com/sfcc-guide',
            source: { name: 'ForkPoint', url: 'https://forkpoint.com/' },
            publishedAt: '2026-09-02T00:00:00Z',
            tags: ['sfcc'],
            cta: { label: 'Read guide' },
        },
        {
            id: 'pwa-guide',
            type: 'article',
            title: 'PWA Kit Architecture',
            summary: 'Headless storefront overview.',
            url: 'https://example.com/pwa-guide',
            source: { name: 'Salesforce', url: 'https://salesforce.com/' },
            publishedAt: '2026-09-01T00:00:00Z',
            tags: ['pwa-kit'],
            cta: { label: 'Explore architecture' },
        },
    ];

    renderCatalog(root, { promotions: [], editorial: articles });

    const searchInput = root.querySelector('.feed-search-input');
    const clearBtn = root.querySelector('.search-clear-btn');
    assert.ok(searchInput);
    assert.ok(clearBtn);

    // Search for "headless" (only in pwa-guide summary)
    searchInput.value = 'headless';
    searchInput.dispatchEvent(new root.ownerDocument.defaultView.Event('input'));

    assert.equal(root.querySelector('[data-item-id="sfcc-guide"]').hidden, true);
    assert.equal(root.querySelector('[data-item-id="pwa-guide"]').hidden, false);
    assert.equal(clearBtn.hidden, false);

    // Clear search
    clearBtn.click();
    assert.equal(searchInput.value, '');
    assert.equal(root.querySelector('[data-item-id="sfcc-guide"]').hidden, false);
    assert.equal(root.querySelector('[data-item-id="pwa-guide"]').hidden, false);
    assert.equal(clearBtn.hidden, true);
});

test('toggles bookmarks, updates Saved pill, and filters saved items', () => {
    const root = createRoot();
    const articles = [
        {
            id: 'sfcc-guide',
            type: 'article',
            title: 'SFCC Developer Guide',
            summary: 'A deep dive into SFCC.',
            url: 'https://example.com/sfcc-guide',
            source: { name: 'Source', url: 'https://example.com/' },
            publishedAt: '2026-09-02T00:00:00Z',
            tags: ['sfcc'],
            cta: { label: 'Read guide' },
        },
        {
            id: 'pwa-guide',
            type: 'article',
            title: 'PWA Kit Architecture',
            summary: 'Headless storefront overview.',
            url: 'https://example.com/pwa-guide',
            source: { name: 'Source', url: 'https://example.com/' },
            publishedAt: '2026-09-01T00:00:00Z',
            tags: ['pwa-kit'],
            cta: { label: 'Explore architecture' },
        },
    ];

    renderCatalog(root, { promotions: [], editorial: articles });

    const bookmarkBtn = root.querySelector('[data-item-id="sfcc-guide"] .card-bookmark-btn');
    assert.ok(bookmarkBtn);

    // Click bookmark button to bookmark sfcc-guide
    bookmarkBtn.click();
    assert.ok(bookmarkBtn.classList.contains('is-bookmarked'));

    // Verify Saved pill appears
    const filterBar = root.querySelector('.filter-bar');
    const savedPill = filterBar.querySelector('[data-filter="saved"]');
    assert.ok(savedPill);
    assert.match(savedPill.textContent, /Saved \(1\)/);

    // Filter by Saved
    savedPill.click();
    assert.equal(root.querySelector('[data-item-id="sfcc-guide"]').hidden, false);
    assert.equal(root.querySelector('[data-item-id="pwa-guide"]').hidden, true);

    // Unbookmark
    bookmarkBtn.click();
    assert.ok(!bookmarkBtn.classList.contains('is-bookmarked'));
});

test('toggles view density between Grid and List view', () => {
    const root = createRoot();
    const articles = [
        {
            id: 'sfcc-guide',
            type: 'article',
            title: 'SFCC Developer Guide',
            summary: 'A deep dive into SFCC.',
            url: 'https://example.com/sfcc-guide',
            source: { name: 'Source', url: 'https://example.com/' },
            publishedAt: '2026-09-02T00:00:00Z',
            tags: ['sfcc'],
            cta: { label: 'Read guide' },
        },
        {
            id: 'pwa-guide',
            type: 'article',
            title: 'PWA Kit Architecture',
            summary: 'Headless storefront overview.',
            url: 'https://example.com/pwa-guide',
            source: { name: 'Source', url: 'https://example.com/' },
            publishedAt: '2026-09-01T00:00:00Z',
            tags: ['pwa-kit'],
            cta: { label: 'Explore architecture' },
        },
    ];

    renderCatalog(root, { promotions: [], editorial: articles });

    const grid = root.querySelector('.card-grid');
    const listBtn = root.querySelector('.view-toggle-btn[data-view="list"]');
    const gridBtn = root.querySelector('.view-toggle-btn[data-view="grid"]');

    assert.ok(listBtn);
    assert.ok(gridBtn);
    assert.equal(grid.classList.contains('is-list-view'), false);

    // Switch to List view
    listBtn.click();
    assert.equal(grid.classList.contains('is-list-view'), true);
    assert.equal(listBtn.classList.contains('is-active'), true);
    assert.equal(gridBtn.classList.contains('is-active'), false);

    // Switch back to Grid view
    gridBtn.click();
    assert.equal(grid.classList.contains('is-list-view'), false);
    assert.equal(gridBtn.classList.contains('is-active'), true);
});
