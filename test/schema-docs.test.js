import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseHTML } from 'linkedom';

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
});

test('configures the pinned Scalar viewer for the generated contract', async () => {
    const html = await readFile('schema.html', 'utf8');
    const { document } = parseHTML(html);
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
    Function('Scalar', setupScript?.textContent ?? '')(Scalar);
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
    assert.match(call?.config.customCss, /\.request-card\.dark-mode[\s\S]*--scalar-background-2: #ffffff/);
});

test('links the public Discover footer to the Scalar reference', async () => {
    const html = await readFile('index.html', 'utf8');
    const { document } = parseHTML(html);
    const link = document.querySelector('.site-footer a[href="schema.html"]');

    assert.equal(link?.textContent, 'Feed reference');
});

test('keeps the public Discover website in the light DWithEase theme', async () => {
    const html = await readFile('index.html', 'utf8');
    const css = await readFile('assets/discover.css', 'utf8');
    const { document } = parseHTML(html);
    const themeColors = document.querySelectorAll('meta[name="theme-color"]');

    assert.equal(themeColors.length, 1);
    assert.equal(themeColors[0]?.getAttribute('content'), '#f6f9fc');
    assert.equal(document.querySelector('.brand-link source[media]'), null);
    assert.match(css, /color-scheme:\s*light;/);
    assert.doesNotMatch(css, /prefers-color-scheme:\s*dark/);
});
