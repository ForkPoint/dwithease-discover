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
