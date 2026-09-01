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

const PRODUCT = {
    id: 'release-pilot-2026',
    kind: 'product',
    productId: 'release-pilot',
    name: 'Release Pilot',
    benefit: 'Keep release work in one clear view.',
    category: 'web-development',
    imageId: 'release-pilot',
    url: 'https://dwithease.com/products/release-pilot',
    ctaLabel: 'View product',
    startsAt: '2026-09-01T00:00:00Z',
    endsAt: '2026-10-01T00:00:00Z',
    placements: ['discover'],
};

test('renders products and updates in extension order with safe text', () => {
    const root = createRoot();
    const unsafeTitle = '<img src=x onerror=alert(1)>';

    renderCatalog(root, {
        ecommerce: [{ ...PRODUCT, productId: 'store-tool', name: 'Store Tool' }],
        webDevelopment: [PRODUCT],
        updates: [{
            id: 'update-1',
            title: unsafeTitle,
            body: 'Line one\\nLine two',
            icon: 'news',
            link: 'https://dwithease.com/news',
            actionButton: 'Read update',
        }],
    }, {
        'release-pilot': 'data:image/png;base64,YWJj',
        news: 'data:image/png;base64,ZGVm',
    });

    assert.deepEqual(
        [...root.querySelectorAll('[data-section-title]')].map((node) => node.textContent),
        ['E-commerce', 'Web Development', 'Updates'],
    );
    assert.equal(root.querySelectorAll('[data-product-id]').length, 2);
    assert.equal(root.querySelector('[data-product-id="release-pilot"] img').getAttribute('src'), 'data:image/png;base64,YWJj');
    assert.equal(root.querySelector('[data-update-id="update-1"] h3').textContent, unsafeTitle);
    assert.equal(root.querySelector('[data-update-id="update-1"] h3 img'), null);
    assert.equal(root.querySelector('[data-update-id="update-1"] p').textContent, 'Line one\nLine two');
    assert.equal(root.querySelector('[data-update-id="update-1"] a').getAttribute('rel'), 'noopener noreferrer');
});

test('renders the Discover empty state', () => {
    const root = createRoot();

    renderCatalog(root, { ecommerce: [], webDevelopment: [], updates: [] }, {});

    assert.match(root.textContent, /There are no products to discover right now/);
    assert.ok(root.querySelector('[data-testid="discover-empty"]'));
});

test('renders a working retry action after a feed error', () => {
    const root = createRoot();
    let retries = 0;

    renderError(root, () => { retries += 1; });
    root.querySelector('button').click();

    assert.match(root.textContent, /Discover could not load/);
    assert.equal(retries, 1);
});

test('loads the selected dev feed and matching image corpus', async () => {
    const root = createRoot();
    const requests = [];
    const fetchImpl = async (url) => {
        requests.push(url);
        return {
            ok: true,
            json: async () => (url.startsWith('feed-')
                ? { messages: [PRODUCT] }
                : { images: [{ name: 'release-pilot', type: 'png', data: 'YWJj' }] }),
        };
    };

    await startDiscoverPage({
        root,
        search: '?feed=dev',
        fetchImpl,
        now: Date.parse('2026-09-10T12:00:00Z'),
    });

    assert.deepEqual(requests, ['feed-dev.json', 'images-dev.json']);
    assert.equal(root.querySelector('[data-product-id="release-pilot"] img').getAttribute('src'), 'data:image/png;base64,YWJj');
});
