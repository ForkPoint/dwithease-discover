import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildCatalog,
    createImageMap,
    selectFeedName,
} from '../assets/feed-model.js';

const NOW = Date.parse('2026-09-10T12:00:00Z');

const PRODUCT = {
    id: 'storefront-health-2026',
    kind: 'product',
    productId: 'storefront-health',
    name: 'Storefront Health',
    benefit: 'Find storefront issues before customers do.',
    category: 'e-commerce',
    imageId: 'storefront-health',
    url: 'https://dwithease.com/products/storefront-health',
    ctaLabel: 'View product',
    startsAt: '2026-09-01T00:00:00Z',
    endsAt: '2026-10-01T00:00:00Z',
    placements: ['discover', 'popup'],
};

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

test('selects the live feed unless the query asks for the dev feed', () => {
    assert.equal(selectFeedName(''), 'live');
    assert.equal(selectFeedName('?feed=dev'), 'dev');
    assert.equal(selectFeedName('?feed=other'), 'live');
});

test('builds the v2 catalog from active promotions and sorted editorial items', () => {
    const olderArticle = {
        id: 'older-article',
        type: 'article',
        title: 'Older article',
        summary: 'An older commerce article.',
        url: 'https://example.com/older',
        source: {
            name: 'Example',
            url: 'https://example.com/',
        },
        publishedAt: '2026-08-01T00:00:00Z',
        tags: ['commerce'],
        cta: {
            label: 'Read article',
        },
    };
    const newerNews = {
        ...olderArticle,
        id: 'newer-news',
        type: 'news',
        title: 'Newer news',
        url: 'https://example.com/newer',
        publishedAt: '2026-08-10T00:00:00Z',
    };

    const catalog = buildCatalog({
        version: 2,
        items: [olderArticle, V2_PROMOTION, newerNews],
    }, NOW);

    assert.deepEqual(catalog.promotions.map(({ id }) => id), ['catalogspark-2026']);
    assert.deepEqual(catalog.editorial.map(({ id }) => id), ['newer-news', 'older-article']);
});

test('groups active Discover products and keeps legacy updates', () => {
    const webProduct = {
        ...PRODUCT,
        id: 'release-pilot-2026',
        productId: 'release-pilot',
        name: 'Release Pilot',
        category: 'web-development',
    };
    const update = {
        id: 22,
        title: 'A useful update',
        body: 'Read the latest news.',
        link: 'https://dwithease.com/news',
    };
    const catalog = buildCatalog({
        messages: [
            PRODUCT,
            webProduct,
            update,
            { ...PRODUCT, id: 'expired', productId: 'expired', endsAt: '2026-09-02T00:00:00Z' },
            { ...PRODUCT, id: 'later', productId: 'later', startsAt: '2026-09-20T00:00:00Z' },
            { ...PRODUCT, id: 'popup-only', productId: 'popup-only', placements: ['popup'] },
            { ...PRODUCT, id: 'unsafe', productId: 'unsafe', url: 'http://example.com' },
        ],
    }, NOW);

    assert.deepEqual(catalog.ecommerce.map(({ productId }) => productId), ['storefront-health']);
    assert.deepEqual(catalog.webDevelopment.map(({ productId }) => productId), ['release-pilot']);
    assert.deepEqual(catalog.updates, [update]);
});

test('creates safe data image URLs from the extension image corpus', () => {
    const images = createImageMap({
        images: [
            { name: 'tool', type: 'png', data: 'YWJj' },
            { name: 'mark', type: 'svg', data: 'PHN2Zy8+' },
            { name: 'bad-type', type: 'html', data: 'YWJj' },
            { name: '__proto__', type: 'png', data: 'YWJj' },
        ],
    });

    assert.deepEqual(Object.entries(images), [
        ['tool', 'data:image/png;base64,YWJj'],
        ['mark', 'data:image/svg+xml;base64,PHN2Zy8+'],
    ]);
});
