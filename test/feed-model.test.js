import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    buildCatalog,
    isHttpsUrl,
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
        locale: 'en',
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

test('counts Unicode code points for browser text limits', () => {
    const article = {
        id: 'unicode-text-limits',
        type: 'article',
        title: '😀'.repeat(120),
        summary: '😀'.repeat(280),
        url: 'https://example.com/unicode-text-limits',
        source: {
            name: '😀'.repeat(80),
            url: 'https://example.com/',
        },
        publishedAt: '2026-08-01T00:00:00Z',
        tags: ['commerce'],
        image: {
            src: 'assets/example.png',
            alt: '😀'.repeat(160),
        },
        cta: {
            label: '😀'.repeat(32),
        },
    };
    const feed = {
        version: 2,
        locale: 'en',
        updatedAt: '2026-09-01T00:00:00Z',
        items: [article],
    };

    assert.equal(validateFeed(feed).success, true);
    assert.deepEqual(
        buildCatalog(feed, NOW).editorial.map(({ id }) => id),
        ['unicode-text-limits'],
    );
});

test('requires raw RFC 3986 lowercase HTTPS URLs across feed validators', () => {
    const article = {
        id: 'lowercase-https',
        type: 'article',
        title: 'Lowercase HTTPS article',
        summary: 'Every remote URL starts with the required lowercase prefix.',
        url: 'https://example.com/article',
        source: {
            name: 'Example',
            url: 'https://example.com/',
        },
        publishedAt: '2026-08-01T00:00:00Z',
        tags: ['commerce'],
        image: {
            src: 'https://example.com/image.png',
            alt: 'Example commerce article',
        },
        cta: {
            label: 'Read article',
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
        ['lowercase-https'],
    );

    for (const url of [
        'https://example.com:8443/article',
        'https://[2001:db8::1]:443/article',
    ]) {
        const feed = { ...validFeed, items: [{ ...article, url }] };
        assert.equal(validateFeed(feed).success, true);
        assert.deepEqual(
            buildCatalog(feed, NOW).editorial.map(({ id }) => id),
            ['lowercase-https'],
        );
    }

    const invalidItems = [
        { ...article, url: 'HTTPS://example.com/article' },
        { ...article, source: { ...article.source, url: 'HTTPS://example.com/' } },
        { ...article, image: { ...article.image, src: 'HTTPS://example.com/image.png' } },
        { ...article, url: 'https://example.com/article\t' },
        { ...article, source: { ...article.source, url: 'https://example.com/\n' } },
        { ...article, image: { ...article.image, src: 'https://example.com/image.png ' } },
        { ...article, url: 'https://example.com\\article' },
        { ...article, source: { ...article.source, url: 'https://example.com/%zz' } },
        { ...article, image: { ...article.image, src: 'https://example.com/image{1}.png' } },
        { ...article, url: 'https://例え.テスト/article' },
        { ...article, url: 'https://example.com/#first#second' },
        { ...article, url: 'https://user@example.com/article' },
        { ...article, url: 'https://a@b@example.com/article' },
        { ...article, source: { ...article.source, url: 'https://example.com:/' } },
        { ...article, image: { ...article.image, src: 'https://example.com:65536/image.png' } },
    ];

    for (const item of invalidItems) {
        const feed = { ...validFeed, items: [item] };
        assert.equal(validateFeed(feed).success, false);
        assert.deepEqual(buildCatalog(feed, NOW).editorial, []);
    }
});

test('keeps web host validation aligned across feed contracts', () => {
    const article = {
        id: 'host-validation',
        type: 'article',
        title: 'Host validation',
        summary: 'Checks the shared web host contract.',
        url: 'https://example.com/',
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
    const jsonSchema = JSON.parse(readFileSync('feed.schema.json', 'utf8'));
    const openapi = JSON.parse(readFileSync('openapi.json', 'utf8'));
    const contractPatterns = {
        jsonSchema: new RegExp(jsonSchema.properties.items.items.oneOf[0].properties.url.pattern),
        openapi: new RegExp(openapi.components.schemas.DiscoverFeed.properties.items.items.oneOf[0].properties.url.pattern),
    };
    const cases = [
        ['https://example.com/path', true],
        ['https://plain-ascii.example/path', true],
        ['https://sub-domain.example.com:8443/path', true],
        ['https://localhost:3000/path', true],
        ['https://127.0.0.1/path', true],
        ['https://[2001:db8::1]:443/path', true],
        ['https://[::ffff:192.0.2.128]/path', true],
        ['https://[v1.foo]/', false],
        ['https://%23/', false],
        ['https://256.0.0.1/', false],
        ['https://[2001:::1]/', false],
        ['https://-example.com/', false],
        ['https://example-.com/', false],
        ['https://xn--a/', false],
        ['https://xn--bcher-kva.example/', false],
        ['https://www.xn--a.example/', false],
        ['https://XN--a.example/', false],
    ];

    for (const [url, accepted] of cases) {
        const feed = {
            version: 2,
            locale: 'en',
            updatedAt: '2026-09-01T00:00:00Z',
            items: [{ ...article, url }],
        };
        assert.equal(validateFeed(feed).success, accepted, `${url} Zod`);
        assert.equal(isHttpsUrl(url), accepted, `${url} browser`);
        for (const [contract, pattern] of Object.entries(contractPatterns)) {
            assert.equal(pattern.test(url), accepted, `${url} ${contract}`);
        }
    }
});

test('rejects final line breaks across regex-backed public fields', () => {
    const article = {
        id: 'strict-end',
        type: 'article',
        title: 'Strict end checks',
        summary: 'Rejects raw line breaks at contract boundaries.',
        url: 'https://example.com/article',
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
    const validFeed = {
        version: 2,
        locale: 'en',
        updatedAt: '2026-09-01T00:00:00Z',
        items: [article],
    };
    const jsonSchema = JSON.parse(readFileSync('feed.schema.json', 'utf8'));
    const openapi = JSON.parse(readFileSync('openapi.json', 'utf8'));
    const jsonArticle = jsonSchema.properties.items.items.oneOf[0];
    const openapiArticle = openapi.components.schemas.DiscoverFeed.properties.items.items.oneOf[0];
    const fields = [
        {
            name: 'URL',
            value: article.url,
            makeFeed: (value) => ({ ...validFeed, items: [{ ...article, url: value }] }),
            patterns: [jsonArticle.properties.url.pattern, openapiArticle.properties.url.pattern],
        },
        {
            name: 'slug',
            value: article.id,
            makeFeed: (value) => ({ ...validFeed, items: [{ ...article, id: value }] }),
            patterns: [jsonArticle.properties.id.pattern, openapiArticle.properties.id.pattern],
        },
        {
            name: 'locale',
            value: validFeed.locale,
            makeFeed: (value) => ({ ...validFeed, locale: value }),
            patterns: [jsonSchema.properties.locale.pattern, openapi.components.schemas.DiscoverFeed.properties.locale.pattern],
        },
        {
            name: 'date-time',
            value: article.publishedAt,
            makeFeed: (value) => ({ ...validFeed, items: [{ ...article, publishedAt: value }] }),
            patterns: [jsonArticle.properties.publishedAt.pattern, openapiArticle.properties.publishedAt.pattern],
        },
    ];

    for (const lineBreak of ['\n', '\r\n']) {
        for (const field of fields) {
            const value = `${field.value}${lineBreak}`;
            const feed = field.makeFeed(value);
            const caseName = `${field.name} with ${JSON.stringify(lineBreak)}`;
            assert.equal(validateFeed(feed).success, false, `${caseName} Zod`);
            assert.deepEqual(buildCatalog(feed, NOW).editorial, [], `${caseName} browser`);
            for (const pattern of field.patterns) {
                assert.equal(new RegExp(pattern).test(value), false, `${caseName} public contract`);
            }
        }
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
