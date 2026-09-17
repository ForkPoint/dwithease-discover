import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

import { chromium } from 'playwright-core';

const SITE_ROOT = process.cwd();
const LONG_TEXT = {
    title: 'T'.repeat(120),
    summary: 'S'.repeat(280),
    source: 'N'.repeat(80),
    tag: 't'.repeat(120),
    cta: 'C'.repeat(32),
};
const COMMON_ITEM = {
    title: LONG_TEXT.title,
    summary: LONG_TEXT.summary,
    source: {
        name: LONG_TEXT.source,
        url: 'https://example.com/',
    },
    publishedAt: '2026-09-01T00:00:00Z',
    tags: [LONG_TEXT.tag],
    cta: {
        label: LONG_TEXT.cta,
    },
};
const TEST_FEED = {
    locale: 'en',
    updatedAt: '2026-09-01T00:00:00Z',
    items: [
        {
            ...COMMON_ITEM,
            id: 'long-promotion',
            type: 'promotion',
            url: 'https://example.com/promotion',
            campaign: {
                id: 'long-promotion-campaign',
                startsAt: '2020-01-01T00:00:00Z',
                endsAt: '2099-01-01T00:00:00Z',
                placements: ['discover'],
            },
        },
        {
            ...COMMON_ITEM,
            id: 'long-article',
            type: 'article',
            url: 'https://example.com/article',
        },
    ],
};

const CONTENT_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
};

function chromeExecutable() {
    const candidates = [
        process.env.CHROME_PATH,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ].filter(Boolean);
    const executable = candidates.find((candidate) => existsSync(candidate));
    assert.ok(executable, 'Chrome is required for computed-style tests');
    return executable;
}

async function staticResponse(request, response) {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
    const filePath = resolve(SITE_ROOT, relativePath);
    if (filePath !== SITE_ROOT && !filePath.startsWith(`${SITE_ROOT}${sep}`)) {
        response.writeHead(403).end();
        return;
    }

    try {
        const body = await readFile(filePath);
        response.writeHead(200, {
            'content-type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
        });
        response.end(body);
    } catch {
        response.writeHead(404).end();
    }
}

function listen(server) {
    return new Promise((resolveListen, rejectListen) => {
        server.once('error', rejectListen);
        server.listen(0, '127.0.0.1', () => resolveListen());
    });
}

function close(server) {
    return new Promise((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
    });
}

function colorChannels(color) {
    return color.match(/[\d.]+/g).slice(0, 3).map(Number);
}

function relativeLuminance(color) {
    const [red, green, blue] = colorChannels(color).map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first, second) {
    const luminances = [relativeLuminance(first), relativeLuminance(second)]
        .sort((left, right) => right - left);
    return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

let browser;
let server;
let siteUrl;

test.before(async () => {
    server = createServer((request, response) => {
        staticResponse(request, response);
    });
    await listen(server);
    const address = server.address();
    siteUrl = `http://127.0.0.1:${address.port}/`;
    browser = await chromium.launch({
        executablePath: chromeExecutable(),
        headless: true,
        args: ['--no-sandbox'],
    });
});

test.after(async () => {
    await browser?.close();
    if (server) await close(server);
});

async function openDiscoverPage(context) {
    const browserContext = await browser.newContext({
        colorScheme: 'dark',
        reducedMotion: 'reduce',
        viewport: { width: 320, height: 900 },
    });
    context.after(() => browserContext.close());
    const page = await browserContext.newPage();
    await page.route('**/feed-live.json', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TEST_FEED),
    }));
    await page.route('**/sources.json', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
            sources: [{
                name: 'Example',
                url: 'https://example.com/',
                icon: 'assets/sources/github.svg',
            }],
        }),
    }));
    await page.goto(siteUrl, { waitUntil: 'networkidle' });
    await page.locator('[data-item-id="long-promotion"]').waitFor();
    return page;
}

test('computes the dark theme under a dark system preference and toggles to light', async (context) => {
    const page = await openDiscoverPage(context);
    const darkComputed = await page.evaluate(() => ({
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
        background: getComputedStyle(document.body).backgroundColor,
    }));

    assert.equal(darkComputed.colorScheme, 'dark');
    assert.ok(relativeLuminance(darkComputed.background) <= 0.2);
    const darkLogo = await page.locator('.brand-logo').evaluate((el) => el.currentSrc || el.src);
    assert.match(darkLogo, /dwithease-logo-on-dark\.svg$/);

    await page.locator('.theme-btn[data-theme-option="light"]').click();
    await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor !== 'rgb(9, 13, 20)');
    const lightComputed = await page.evaluate(() => ({
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
        background: getComputedStyle(document.body).backgroundColor,
    }));

    assert.equal(lightComputed.colorScheme, 'light');
    assert.ok(relativeLuminance(lightComputed.background) >= 0.9);
    const lightLogo = await page.locator('.brand-logo').evaluate((el) => el.currentSrc || el.src);
    assert.match(lightLogo, /dwithease-logo\.svg$/);

    await page.reload({ waitUntil: 'networkidle' });
    const reloadedLightLogo = await page.locator('.brand-logo').evaluate((el) => el.currentSrc || el.src);
    assert.match(reloadedLightLogo, /dwithease-logo\.svg$/);
});

test('renders same-origin source icons at 28 by 28 pixels', async (context) => {
    const page = await openDiscoverPage(context);
    const icons = await page.locator('.source-icon').evaluateAll((elements) => elements.map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
            width: bounds.width,
            height: bounds.height,
            source: element.currentSrc,
        };
    }));

    assert.equal(icons.length, 2);
    for (const icon of icons) {
        assert.equal(icon.width, 28);
        assert.equal(icon.height, 28);
        assert.equal(new URL(icon.source).origin, new URL(siteUrl).origin);
        assert.match(icon.source, /\/assets\/sources\/github\.svg$/);
    }
});

test('alternates dual icons and provides high-contrast tiles for single icons under dark preference', async (context) => {
    const browserContext = await browser.newContext({
        colorScheme: 'dark',
        viewport: { width: 320, height: 900 },
    });
    context.after(() => browserContext.close());
    const page = await browserContext.newPage();
    const testFeed = {
        locale: 'en',
        updatedAt: '2026-09-01T00:00:00Z',
        items: [
            {
                ...TEST_FEED.items[0],
                source: { name: 'Dual Source', url: 'https://dual.example/' },
            },
            {
                ...TEST_FEED.items[1],
                source: { name: 'Single Source', url: 'https://single.example/' },
            },
        ],
    };
    await page.route('**/feed-live.json', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(testFeed),
    }));
    await page.route('**/sources.json', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
            sources: [
                {
                    name: 'Dual Source',
                    url: 'https://dual.example/',
                    icon: 'assets/sources/github.svg',
                    iconDark: 'assets/sources/github-dark.svg',
                },
                {
                    name: 'Single Source',
                    url: 'https://single.example/',
                    icon: 'assets/sources/retailpace.ico',
                },
            ],
        }),
    }));
    await page.goto(siteUrl, { waitUntil: 'networkidle' });
    await page.locator('[data-item-id="long-promotion"]').waitFor();
    await page.waitForFunction(() => document.querySelector('.source-icon[data-has-dual-icon="true"]'));

    const brandLogoSrc = await page.locator('.brand-logo').evaluate((el) => el.currentSrc);
    assert.match(brandLogoSrc, /dwithease-logo-on-dark\.svg$/);

    const dualIcon = page.locator(`[data-item-id="${testFeed.items[0].id}"] .source-icon`);
    const dualMetrics = await dualIcon.evaluate((el) => ({
        source: el.currentSrc,
        hasDual: el.dataset.hasDualIcon,
        background: getComputedStyle(el).backgroundColor,
    }));
    assert.match(dualMetrics.source, /github-dark\.svg$/);
    assert.equal(dualMetrics.hasDual, 'true');
    assert.equal(dualMetrics.background, 'rgba(0, 0, 0, 0)');

    const singleIcon = page.locator(`[data-item-id="${testFeed.items[1].id}"] .source-icon`);
    const singleMetrics = await singleIcon.evaluate((el) => ({
        source: el.currentSrc,
        hasDual: el.dataset.hasDualIcon,
        background: getComputedStyle(el).backgroundColor,
    }));
    assert.match(singleMetrics.source, /retailpace\.ico$/);
    assert.equal(singleMetrics.hasDual, undefined);
    assert.equal(singleMetrics.background, 'rgb(255, 255, 255)');
});

test('renders feed text before a delayed source registry', async (context) => {
    const browserContext = await browser.newContext({ viewport: { width: 320, height: 900 } });
    context.after(() => browserContext.close());
    const page = await browserContext.newPage();
    let releaseSourceRoute;
    const sourceRoute = new Promise((resolveRoute) => { releaseSourceRoute = resolveRoute; });

    await page.route('**/feed-live.json', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TEST_FEED),
    }));
    await page.route('**/sources.json', (route) => releaseSourceRoute(route));
    await page.goto(siteUrl, { waitUntil: 'domcontentloaded' });

    const card = page.locator('[data-item-id="long-promotion"]');
    await card.waitFor({ timeout: 1_000 });
    assert.match(await card.textContent(), new RegExp(LONG_TEXT.title));
    assert.match(
        await card.locator('.source-icon').getAttribute('src'),
        /assets\/sources\/source-fallback\.svg$/,
    );

    const route = await sourceRoute;
    await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
            sources: [{
                name: 'Example',
                url: 'https://example.com/',
                icon: 'assets/sources/github.svg',
            }],
        }),
    });
    await page.waitForFunction(() => document.querySelector('.source-icon')
        ?.src.endsWith('/assets/sources/github.svg'));
    assert.match(await card.textContent(), new RegExp(LONG_TEXT.title));
});

test('shows the OpenAPI fallback when the Scalar CDN fails', async (context) => {
    const browserContext = await browser.newContext({
        colorScheme: 'dark',
        viewport: { width: 320, height: 900 },
    });
    context.after(() => browserContext.close());
    const page = await browserContext.newPage();
    await page.route('https://cdn.jsdelivr.net/**', (route) => route.abort('blockedbyclient'));

    await page.goto(`${siteUrl}schema.html`, { waitUntil: 'domcontentloaded' });

    const fallback = page.locator('[data-testid="scalar-fallback"]');
    await fallback.waitFor({ timeout: 1_000 });
    assert.match(await fallback.textContent(), /interactive reference could not load/i);
    const link = fallback.getByRole('link', { name: 'Open the OpenAPI document' });
    assert.equal(await link.getAttribute('href'), 'openapi.json');
    const colors = await fallback.evaluate((element) => ({
        foreground: getComputedStyle(element).color,
        background: getComputedStyle(element).backgroundColor,
    }));
    assert.ok(relativeLuminance(colors.background) >= 0.9);
    assert.ok(contrastRatio(colors.foreground, colors.background) >= 4.5);
});

test('computes WCAG AA contrast for normal and hovered action text', async (context) => {
    const page = await openDiscoverPage(context);
    const button = page.locator('.promotion-card .button');
    const normal = await button.evaluate((element) => ({
        color: getComputedStyle(element).color,
        background: getComputedStyle(element).backgroundColor,
    }));

    await button.hover();
    await page.waitForFunction((previous) => (
        getComputedStyle(document.querySelector('.promotion-card .button')).backgroundColor
            !== previous
    ), normal.background);
    const hovered = await button.evaluate((element) => ({
        color: getComputedStyle(element).color,
        background: getComputedStyle(element).backgroundColor,
    }));

    assert.ok(contrastRatio(normal.color, normal.background) >= 4.5);
    assert.ok(contrastRatio(hovered.color, hovered.background) >= 4.5);
});

test('wraps all accepted feed text without overflow or clamping', async (context) => {
    const page = await openDiscoverPage(context);
    const selectors = {
        '.card-source': 2,
        '.card-title': 2,
        '.card-copy': 2,
        '.tag': 2,
        '.card-actions .button': 1,
        '.card-actions .text-link': 1,
    };

    for (const [selector, expectedCount] of Object.entries(selectors)) {
        const metrics = await page.locator(selector).evaluateAll((elements) => elements.map((element) => {
            const style = getComputedStyle(element);
            const bounds = element.getBoundingClientRect();
            const cardBounds = element.closest('.feed-card').getBoundingClientRect();
            return {
                overflowWrap: style.overflowWrap,
                lineClamp: style.webkitLineClamp,
                textOverflow: style.textOverflow,
                whiteSpace: style.whiteSpace,
                overflowX: style.overflowX,
                overflowY: style.overflowY,
                horizontalOverflow: element.scrollWidth - element.clientWidth,
                verticalOverflow: element.scrollHeight - element.clientHeight,
                leftUnderflow: cardBounds.left - bounds.left,
                rightOverflow: bounds.right - cardBounds.right,
            };
        }));

        assert.equal(metrics.length, expectedCount);
        for (const metric of metrics) {
            assert.equal(metric.overflowWrap, 'anywhere');
            assert.equal(metric.lineClamp, 'none');
            assert.equal(metric.textOverflow, 'clip');
            assert.equal(metric.whiteSpace, 'normal');
            assert.notEqual(metric.overflowX, 'hidden');
            assert.notEqual(metric.overflowY, 'hidden');
            assert.ok(metric.horizontalOverflow <= 1);
            assert.ok(metric.verticalOverflow <= 1);
            assert.ok(metric.leftUnderflow <= 1);
            assert.ok(metric.rightOverflow <= 1);
        }
    }

    const pageOverflow = await page.evaluate(() => ({
        horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        cards: [...document.querySelectorAll('.feed-card')].map((card) => ({
            horizontal: card.scrollWidth - card.clientWidth,
            vertical: card.scrollHeight - card.clientHeight,
        })),
    }));
    assert.ok(pageOverflow.horizontal <= 1);
    for (const card of pageOverflow.cards) {
        assert.ok(card.horizontal <= 1);
        assert.ok(card.vertical <= 1);
    }
});

test('displays toast notifications and toggles keyboard shortcuts modal in the browser', async (context) => {
    const page = await openDiscoverPage(context);

    // Press '?' to open shortcuts modal
    await page.keyboard.press('?');
    const modal = page.locator('#shortcuts-modal');
    await modal.waitFor({ state: 'visible', timeout: 2000 });
    assert.equal(await modal.getAttribute('role'), 'dialog');

    // Press Escape to close modal
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => {
        const m = document.getElementById('shortcuts-modal');
        return !m || m.hasAttribute('hidden');
    });

    // Click shortcuts button in footer to open modal
    const footerBtn = page.locator('#shortcuts-btn');
    await footerBtn.click();
    await modal.waitFor({ state: 'visible', timeout: 2000 });

    // Close via close button
    await page.locator('.modal-close-btn').click();
    await page.waitForFunction(() => {
        const m = document.getElementById('shortcuts-modal');
        return !m || m.hasAttribute('hidden');
    });

    // Click bookmark button on a card and check toast notification
    const bookmarkBtn = page.locator('.card-bookmark-btn').first();
    await bookmarkBtn.click();
    const toast = page.locator('.toast');
    await toast.waitFor({ state: 'visible', timeout: 2000 });
    assert.match(await toast.textContent(), /Article saved to bookmarks/);

    // Verify toast contrast in dark mode
    const toastColors = await toast.evaluate((el) => ({
        color: getComputedStyle(el).color,
        background: getComputedStyle(el).backgroundColor,
    }));
    assert.ok(contrastRatio(toastColors.color, toastColors.background) >= 4.5);

    // Click Reader Apps button to open subscribe modal
    const subscribeBtn = page.locator('#subscribe-feed-btn');
    await subscribeBtn.click();
    const subModal = page.locator('#subscribe-modal');
    await subModal.waitFor({ state: 'visible', timeout: 2000 });
    assert.equal(await subModal.getAttribute('role'), 'dialog');
    assert.match(await subModal.textContent(), /Live JSON Feed/);

    // Close subscribe modal
    await subModal.locator('.modal-close-btn').click();
    await page.waitForFunction(() => {
        const m = document.getElementById('subscribe-modal');
        return !m || m.hasAttribute('hidden');
    });
});

test('renders filter pills, view toggles, and search input with high contrast under dark theme', async (context) => {
    const browserContext = await browser.newContext({
        colorScheme: 'dark',
        reducedMotion: 'reduce',
        viewport: { width: 400, height: 900 },
    });
    context.after(() => browserContext.close());
    const page = await browserContext.newPage();
    await page.route('**/feed-live.json', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
            locale: 'en',
            updatedAt: '2026-09-01T00:00:00Z',
            items: [
                {
                    ...COMMON_ITEM,
                    id: 'art-1',
                    type: 'article',
                    url: 'https://example.com/art-1',
                    tags: ['sfcc'],
                },
                {
                    ...COMMON_ITEM,
                    id: 'art-2',
                    type: 'article',
                    url: 'https://example.com/art-2',
                    tags: ['pwa-kit'],
                },
            ],
        }),
    }));
    await page.route('**/sources.json', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sources: [] }),
    }));
    await page.goto(siteUrl, { waitUntil: 'networkidle' });
    await page.locator('.filter-bar').waitFor();

    // Inactive filter pill
    const inactivePill = page.locator('.filter-pill:not(.is-active)').first();
    const inactivePillColors = await inactivePill.evaluate((el) => ({
        color: getComputedStyle(el).color,
        background: getComputedStyle(el).backgroundColor,
    }));
    assert.ok(contrastRatio(inactivePillColors.color, inactivePillColors.background) >= 4.5);
    assert.ok(relativeLuminance(inactivePillColors.background) <= 0.2);

    // Active filter pill
    const activePill = page.locator('.filter-pill.is-active');
    const activePillColors = await activePill.evaluate((el) => ({
        color: getComputedStyle(el).color,
        background: getComputedStyle(el).backgroundColor,
    }));
    assert.ok(contrastRatio(activePillColors.color, activePillColors.background) >= 4.5);

    // View toggle buttons
    const activeToggle = page.locator('.view-toggle-btn.is-active');
    const activeToggleColors = await activeToggle.evaluate((el) => ({
        color: getComputedStyle(el).color,
        background: getComputedStyle(el).backgroundColor,
    }));
    assert.ok(contrastRatio(activeToggleColors.color, activeToggleColors.background) >= 4.5);

    const inactiveToggle = page.locator('.view-toggle-btn:not(.is-active)').first();
    const toggleContainer = page.locator('.view-toggle');
    const inactiveToggleColors = await inactiveToggle.evaluate((el) => ({
        color: getComputedStyle(el).color,
    }));
    const toggleContainerBg = await toggleContainer.evaluate((el) => getComputedStyle(el).backgroundColor);
    assert.ok(contrastRatio(inactiveToggleColors.color, toggleContainerBg) >= 4.5);

    // Search input
    const searchInput = page.locator('.feed-search-input');
    const searchColors = await searchInput.evaluate((el) => ({
        color: getComputedStyle(el).color,
        background: getComputedStyle(el).backgroundColor,
    }));
    assert.ok(contrastRatio(searchColors.color, searchColors.background) >= 4.5);
    assert.ok(relativeLuminance(searchColors.background) <= 0.2);
});

