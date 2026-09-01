import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { validateFeed } from '../scripts/feed-schema.ts';

const ARTICLE = {
    id: 'b2c-commerce-cli',
    type: 'article',
    title: 'Introducing the B2C Commerce CLI',
    summary: 'Use supported tools for common B2C Commerce development tasks.',
    url: 'https://developer.salesforce.com/blogs/2026/04/introducing-the-b2c-commerce-cli',
    source: {
        name: 'Salesforce Developers Blog',
        url: 'https://developer.salesforce.com/blogs',
    },
    publishedAt: '2026-04-08T09:00:00Z',
    tags: ['salesforce', 'b2c-commerce'],
    image: {
        src: 'https://developer.salesforce.com/example.png',
        alt: 'B2C Commerce command-line interface',
    },
    cta: {
        label: 'Read article',
    },
};

const PROMOTION = {
    id: 'agentic-storefront-audit',
    type: 'promotion',
    title: 'Check your agentic storefront',
    summary: 'Run 199 checks and get a storefront readiness report.',
    url: 'https://audit.agenticstorefront.com/',
    source: {
        name: 'Agentic Storefront',
        url: 'https://agenticstorefront.com/',
    },
    publishedAt: '2026-09-01T00:00:00Z',
    tags: ['agentic-commerce', 'storefront-audit'],
    cta: {
        label: 'Run free audit',
    },
    campaign: {
        id: 'agentic-storefront-audit-2026',
        startsAt: '2026-09-01T00:00:00Z',
        endsAt: '2026-10-01T00:00:00Z',
        placements: ['discover', 'task-end'],
    },
};

const VALID_FEED = {
    version: 2,
    locale: 'en',
    updatedAt: '2026-09-01T12:00:00Z',
    items: [ARTICLE, PROMOTION],
};

test('accepts the version 2 article and promotion contract', () => {
    const result = validateFeed(VALID_FEED);

    assert.equal(result.success, true);
});

test('rejects unsafe URLs, duplicate IDs, and invalid campaign dates', () => {
    const result = validateFeed({
        version: 2,
        locale: 'en',
        updatedAt: '2026-09-01T12:00:00Z',
        items: [
            ARTICLE,
            {
                ...PROMOTION,
                id: ARTICLE.id,
                url: 'http://audit.agenticstorefront.com/',
                campaign: {
                    ...PROMOTION.campaign,
                    endsAt: PROMOTION.campaign.startsAt,
                },
            },
        ],
    });

    assert.equal(result.success, false);
    assert.deepEqual(
        result.errors.map(({ path }) => path),
        ['items.1.url', 'items.1.campaign.endsAt', 'items.1.id'],
    );
});

test('checks a valid feed file from the command line', async (context) => {
    const directory = await mkdtemp(join(tmpdir(), 'discover-feed-'));
    context.after(() => rm(directory, { recursive: true, force: true }));
    const feedPath = join(directory, 'valid.json');
    await writeFile(feedPath, JSON.stringify(VALID_FEED));

    const result = spawnSync(process.execPath, ['scripts/validate-feed.ts', feedPath], {
        cwd: process.cwd(),
        encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /valid\.json: valid/);
});

test('reports bad feed fields from the command line', async (context) => {
    const directory = await mkdtemp(join(tmpdir(), 'discover-feed-'));
    context.after(() => rm(directory, { recursive: true, force: true }));
    const feedPath = join(directory, 'invalid.json');
    await writeFile(feedPath, JSON.stringify({ ...VALID_FEED, version: 1 }));

    const result = spawnSync(process.execPath, ['scripts/validate-feed.ts', feedPath], {
        cwd: process.cwd(),
        encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid\.json: version: Invalid input/);
});

test('writes the public JSON Schema from the Zod contract', async (context) => {
    const directory = await mkdtemp(join(tmpdir(), 'discover-schema-'));
    context.after(() => rm(directory, { recursive: true, force: true }));
    const schemaPath = join(directory, 'feed.schema.json');

    const result = spawnSync(process.execPath, ['scripts/write-json-schema.ts', schemaPath], {
        cwd: process.cwd(),
        encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.$id, 'https://discover.dwithease.com/feed.schema.json');
    assert.equal(schema.title, 'DWithEase Discover Feed');
    assert.equal(schema.properties.version.const, 2);
    const article = schema.properties.items.items.oneOf[0];
    assert.equal(article.properties.url.pattern, '^https://\\S+$');
    assert.equal(article.properties.source.properties.url.pattern, '^https://\\S+$');
    assert.equal(article.properties.tags.uniqueItems, true);
    assert.equal(article.properties.title.maxLength, 120);
    assert.equal(article.properties.summary.maxLength, 280);
    assert.equal(article.properties.source.properties.name.maxLength, 80);
    assert.equal(article.properties.cta.properties.label.maxLength, 32);
    assert.equal(article.properties.image.properties.alt.maxLength, 160);
    assert.equal(article.properties.title.pattern, '\\S');
    assert.equal(article.properties.summary.pattern, '\\S');
    assert.equal(article.properties.source.properties.name.pattern, '\\S');
    assert.equal(article.properties.cta.properties.label.pattern, '\\S');
    assert.deepEqual(
        article.properties.image.properties.src.anyOf.map(({ pattern }: { pattern?: string }) => pattern),
        ['^https://\\S+$', '^assets\\/'],
    );
});
