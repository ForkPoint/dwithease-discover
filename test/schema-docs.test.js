import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseHTML } from 'linkedom';

import { validateFeed } from '../scripts/feed-schema.ts';

test('writes an OpenAPI 3.1 contract for both Discover feeds', async (context) => {
    const directory = await mkdtemp(join(tmpdir(), 'discover-openapi-'));
    context.after(() => rm(directory, { recursive: true, force: true }));
    const outputPath = join(directory, 'openapi.json');

    const result = spawnSync(process.execPath, ['scripts/write-openapi.ts', outputPath], {
        cwd: process.cwd(),
        encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    const document = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(document.openapi, '3.1.1');
    assert.equal(document.info.title, 'DWithEase Discover Feed API');
    assert.equal(document.servers, undefined);
    assert.equal(
        document.paths['/feed-live.json'].get.responses['200'].content['application/json'].schema.$ref,
        '#/components/schemas/DiscoverFeed',
    );
    assert.equal(
        document.paths['/feed-dev.json'].get.responses['200'].content['application/json'].schema.$ref,
        '#/components/schemas/DiscoverFeed',
    );
    assert.equal(document.components.schemas.DiscoverFeed.properties.version.const, 2);
    const article = document.components.schemas.DiscoverFeed.properties.items.items.oneOf[0];
    const urlPattern = new RegExp(article.properties.url.pattern);
    assert.equal(article.properties.url.format, 'uri');
    assert.equal(urlPattern.test('https://example.com/path?item=1#details'), true);
    assert.equal(urlPattern.test('https://example.com:8443/path'), true);
    assert.equal(urlPattern.test('https://[2001:db8::1]:443/path'), true);
    assert.equal(urlPattern.test('https://example.com\\path'), false);
    assert.equal(urlPattern.test('https://example.com/%zz'), false);
    assert.equal(urlPattern.test('https://例え.テスト/path'), false);
    assert.equal(urlPattern.test('https://user@example.com/path'), false);
    assert.equal(urlPattern.test('https://a@b@example.com/path'), false);
    assert.equal(urlPattern.test('https://example.com:/path'), false);
    assert.equal(urlPattern.test('https://example.com:65536/path'), false);
    assert.equal(article.properties.source.properties.url.pattern, article.properties.url.pattern);
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
        article.properties.image.properties.src.anyOf.map(({ pattern }) => pattern),
        [article.properties.url.pattern, '^assets\\/'],
    );
});

test('keeps the legacy live feed unchanged during v2 development', async () => {
    const live = await readFile('feed-live.json', 'utf8');
    const development = JSON.parse(await readFile('feed-dev.json', 'utf8'));

    assert.equal(validateFeed(development).success, true);
    assert.ok(development.items.length > 0);
    assert.equal(
        createHash('sha256').update(live).digest('hex'),
        '4e5d6ae0f0e6092f0b53e7a352b2c91156586fab4d1e3e5ccd99a25b1ac721d6',
    );
});

test('configures the pinned Scalar viewer for the generated contract', async () => {
    const html = await readFile('schema.html', 'utf8');
    const { document, window } = parseHTML(html);
    const externalScript = document.querySelector('script[src]');
    const setupScript = document.querySelector('script:not([src])');
    let call;
    const Scalar = {
        createApiReference(selector, config) {
            call = { selector, config };
        },
    };

    assert.equal(document.title, 'Discover Feed Reference · DWithEase');
    assert.ok(document.querySelector('#app'));
    assert.equal(
        externalScript?.getAttribute('src'),
        'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.67.0',
    );
    window.Scalar = Scalar;
    Function('window', 'document', setupScript?.textContent ?? '')(window, document);
    assert.equal(call?.selector, '#app');
    assert.equal(call?.config.url, 'openapi.json');
    assert.equal(call?.config.showDeveloperTools, 'never');
    assert.equal(call?.config.forceDarkModeState, 'light');
    assert.equal(call?.config.hideDarkModeToggle, true);
    assert.equal(call?.config.hideClientButton, true);
    assert.equal(call?.config.hideTestRequestButton, true);
    assert.equal(call?.config.hiddenClients, true);
    assert.equal(call?.config.documentDownloadType, 'none');
    assert.equal(call?.config.withDefaultFonts, false);
    assert.equal(call?.config.telemetry, false);
    assert.deepEqual(call?.config.agent, { disabled: true });
    assert.deepEqual(call?.config.mcp, { disabled: true });
    assert.equal(call?.config.modelsSectionLabel, 'Schemas');
});

test('links the public Discover footer to the Scalar reference', async () => {
    const html = await readFile('index.html', 'utf8');
    const { document } = parseHTML(html);
    const link = document.querySelector('.site-footer a[href="schema.html"]');

    assert.equal(link?.textContent, 'Feed reference');
});
