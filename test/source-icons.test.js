import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FeedSchema } from '../scripts/feed-schema.ts';
import { withSourceIcon } from '../scripts/source-icons.js';
import { buildCatalog } from '../assets/feed-model.js';

const article = {
    id: 'source-icon-test', type: 'article', title: 'Icon test', summary: 'Source icon contract.',
    url: 'https://example.com/article', source: { name: 'Salesforce', url: 'https://developer.salesforce.com/blogs/feed' },
    publishedAt: '2026-09-01T00:00:00Z', tags: ['sfcc'], cta: { label: 'Read' },
};
const feed = (item) => ({ locale: 'en', updatedAt: '2026-09-01T00:00:00Z', items: [item] });

test('source icons appear in feed items and work in both validators', () => {
    const item = withSourceIcon(article);
    assert.equal(item.source.icon, 'https://discover.dwithease.com/assets/sources/salesforce.svg');
    assert.equal(FeedSchema.safeParse(feed(item)).success, true);
    assert.equal(buildCatalog(feed(item)).editorial.length, 1);
    assert.equal(FeedSchema.safeParse(feed(article)).success, true);
    assert.equal(buildCatalog(feed(article)).editorial.length, 1);
});

test('unknown sources receive the publisher fallback; unsafe icon URLs fail', () => {
    const item = withSourceIcon({ ...article, source: { name: 'Unknown', url: 'https://unknown.example/' } });
    assert.equal(item.source.icon, 'https://discover.dwithease.com/assets/sources/source-fallback.svg');
    const unsafe = { ...item, source: { ...item.source, icon: 'javascript:alert(1)' } };
    assert.equal(FeedSchema.safeParse(feed(unsafe)).success, false);
    assert.equal(buildCatalog(feed(unsafe)).editorial.length, 0);
});
