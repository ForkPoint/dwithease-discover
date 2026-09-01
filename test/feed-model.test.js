import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildCatalog,
    selectFeedName,
} from '../assets/feed-model.js';
import { validateFeed } from '../scripts/feed-schema.ts';

const NOW = Date.parse('2026-09-10T12:00:00Z');

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
    publishedAt: '2026-09-01T02:30:00+02:30',
    tags: ['product-data'],
    cta: {
        label: 'Explore CatalogSpark',
    },
    campaign: {
        id: 'catalogspark-2026',
        startsAt: '2026-09-01T02:30:00+02:30',
        endsAt: '2026-10-01T02:30:00+02:30',
        placements: ['discover'],
    },
};

test('selects the live feed unless the query asks for the dev feed', () => {
    assert.equal(selectFeedName(''), 'live');
    assert.equal(selectFeedName('?feed=dev'), 'dev');
    assert.equal(selectFeedName('?feed=other'), 'live');
});

test('builds the v2 catalog with schema-valid offsets and sorted editorial items', () => {
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
        publishedAt: '2026-08-01T02:30:00+02:30',
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
        publishedAt: '2026-08-10T08:00:00-04:00',
    };

    const catalog = buildCatalog({
        version: 2,
        items: [olderArticle, V2_PROMOTION, newerNews],
    }, NOW);

    assert.deepEqual(catalog.promotions.map(({ id }) => id), ['catalogspark-2026']);
    assert.deepEqual(catalog.editorial.map(({ id }) => id), ['newer-news', 'older-article']);
});

test('enforces raw v2 text limits in Zod and the browser catalog', () => {
    const article = {
        id: 'raw-text-limits',
        type: 'article',
        title: 'T'.repeat(120),
        summary: 'S'.repeat(280),
        url: 'https://example.com/raw-text-limits',
        source: {
            name: 'N'.repeat(80),
            url: 'https://example.com/',
        },
        publishedAt: '2026-08-01T00:00:00Z',
        tags: ['commerce'],
        image: {
            src: 'assets/example.png',
            alt: 'A'.repeat(160),
        },
        cta: {
            label: 'C'.repeat(32),
        },
    };
    const validFeed = {
        version: 2,
        locale: 'en',
        updatedAt: '2026-09-01T00:00:00Z',
        items: [article],
    };

    assert.equal(validateFeed(validFeed).success, true);
    assert.deepEqual(
        buildCatalog(validFeed, NOW).editorial.map(({ id }) => id),
        ['raw-text-limits'],
    );

    const overLimitItems = [
        { ...article, title: ` ${article.title}` },
        { ...article, summary: ` ${article.summary}` },
        { ...article, source: { ...article.source, name: ` ${article.source.name}` } },
        { ...article, cta: { label: ` ${article.cta.label}` } },
        { ...article, image: { ...article.image, alt: ` ${article.image.alt}` } },
    ];

    for (const item of overLimitItems) {
        const feed = { ...validFeed, items: [item] };
        assert.equal(validateFeed(feed).success, false);
        assert.deepEqual(buildCatalog(feed, NOW).editorial, []);
    }
});

test('renders schema-valid reserved-word slugs', () => {
    const article = {
        id: 'constructor',
        type: 'article',
        title: 'Reserved slug article',
        summary: 'Reserved JavaScript names remain valid feed slugs.',
        url: 'https://example.com/constructor',
        source: {
            name: 'Example',
            url: 'https://example.com/',
        },
        publishedAt: '2026-08-01T00:00:00Z',
        tags: ['prototype'],
        cta: {
            label: 'Read article',
        },
    };
    const promotion = {
        ...V2_PROMOTION,
        id: 'prototype',
        tags: ['constructor'],
        campaign: {
            ...V2_PROMOTION.campaign,
            id: 'constructor',
        },
    };
    const feed = {
        version: 2,
        locale: 'en',
        updatedAt: '2026-09-01T00:00:00Z',
        items: [article, promotion],
    };

    assert.equal(validateFeed(feed).success, true);
    const catalog = buildCatalog(feed, NOW);
    assert.deepEqual(catalog.editorial.map(({ id }) => id), ['constructor']);
    assert.deepEqual(catalog.promotions.map(({ id }) => id), ['prototype']);
});

test('returns an empty v2 catalog for invalid payloads', () => {
    assert.deepEqual(buildCatalog({ items: [] }, NOW), {
        promotions: [],
        editorial: [],
    });
});
