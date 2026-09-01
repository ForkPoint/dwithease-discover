import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseHTML } from 'linkedom';

import { validateFeed } from '../scripts/feed-schema.ts';

function parseCssRules(css) {
    const { document } = parseHTML('<html><head><style></style></head><body></body></html>');
    const style = document.querySelector('style');
    style.textContent = css;
    return [...style.sheet.cssRules];
}

function declaredValue(rules, selector, property) {
    return rules.reduce((value, rule) => (
        rule.selectorText === selector && rule.style.getPropertyValue(property)
            ? rule.style.getPropertyValue(property)
            : value
    ), '');
}

function declaredValueForSelector(rules, selector, property) {
    return rules.reduce((value, rule) => {
        const selectors = rule.selectorText?.split(',').map((item) => item.trim()) ?? [];
        const declared = rule.style?.getPropertyValue(property);
        return selectors.includes(selector) && declared ? declared : value;
    }, '');
}

function resolveColor(rules, value) {
    const property = value.match(/^var\((--[^)]+)\)$/)?.[1];
    return property ? declaredValue(rules, ':root', property) : value;
}

function relativeLuminance(hex) {
    const normalized = hex.length === 4
        ? hex.slice(1).split('').map((digit) => digit.repeat(2))
        : hex.slice(1).match(/.{2}/g);
    const [red, green, blue] = normalized.map((channel) => {
        const value = Number.parseInt(channel, 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first, second) {
    const luminances = [relativeLuminance(first), relativeLuminance(second)]
        .sort((left, right) => right - left);
    return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

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
    assert.equal(article.properties.url.pattern, '^https://');
    assert.equal(article.properties.source.properties.url.pattern, '^https://');
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
        ['^https://', '^assets\\/'],
    );
});

test('publishes both documented endpoints as v2 feeds', async () => {
    const live = JSON.parse(await readFile('feed-live.json', 'utf8'));
    const development = JSON.parse(await readFile('feed-dev.json', 'utf8'));

    assert.equal(validateFeed(live).success, true);
    assert.equal(validateFeed(development).success, true);
    assert.deepEqual(live.items, []);
    assert.ok(development.items.length > 0);
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
    assert.equal(
        declaredValue(
            parseCssRules(call?.config.customCss ?? ''),
            '.request-card.dark-mode',
            '--scalar-background-2',
        ),
        '#ffffff',
    );
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
    const rules = parseCssRules(css);
    assert.equal(declaredValue(rules, ':root', 'color-scheme'), 'light');
    assert.equal(
        rules.some((rule) => rule.media?.mediaText.includes('prefers-color-scheme')),
        false,
    );
});

test('keeps action text at WCAG AA contrast', async () => {
    const css = await readFile('assets/discover.css', 'utf8');
    const rules = parseCssRules(css);
    const text = declaredValueForSelector(rules, '.button', 'color');
    const backgrounds = [
        declaredValueForSelector(rules, '.button', 'background'),
        declaredValueForSelector(rules, '.button:hover', 'background'),
    ].map((value) => resolveColor(rules, value));

    for (const background of backgrounds) {
        assert.ok(
            contrastRatio(text, background) >= 4.5,
            `${text} on ${background} must have at least 4.5:1 contrast`,
        );
    }
});
