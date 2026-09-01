import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

import {
    renderCatalog,
    renderError,
    startDiscoverPage,
} from '../assets/discover-page.js';

function createRoot() {
    const { document } = parseHTML('<main id="discover-content"></main>');
    return document.getElementById('discover-content');
}

const V2_PROMOTION = {
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

test('renders v2 promotions and editorial items with useful metadata', () => {
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

    renderCatalog(root, {
        promotions: [V2_PROMOTION],
        editorial: [article],
    });

    assert.deepEqual(
        [...root.querySelectorAll('[data-section-title]')].map((node) => node.textContent),
        ['Featured tools', 'Latest from commerce'],
    );
    assert.equal(root.querySelector('[data-item-id="commerce-news"] h3').textContent, unsafeTitle);
    assert.equal(root.querySelector('[data-item-id="commerce-news"] h3 img'), null);
    assert.match(root.querySelector('[data-item-id="commerce-news"]').textContent, /Commerce Source/);
    assert.match(root.querySelector('[data-item-id="commerce-news"]').textContent, /Aug 30, 2026/);
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
    assert.ok(root.querySelector('[data-testid="discover-empty"]'));
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
            promotions: [{ ...V2_PROMOTION, url }],
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
    assert.equal(retries, 1);
});

test('loads only the selected v2 feed', async () => {
    const root = createRoot();
    const requests = [];
    const fetchImpl = async (url) => {
        requests.push(url);
        return {
            ok: true,
            json: async () => ({
                version: 2,
                locale: 'en',
                updatedAt: '2026-09-01T00:00:00Z',
                items: [V2_PROMOTION],
            }),
        };
    };

    await startDiscoverPage({
        root,
        search: '?feed=dev',
        fetchImpl,
        now: Date.parse('2026-09-10T12:00:00Z'),
    });

    assert.deepEqual(requests, ['feed-dev.json']);
    assert.ok(root.querySelector('[data-item-id="catalogspark-2026"]'));
});
