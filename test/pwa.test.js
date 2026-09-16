import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';

test('validates PWA manifest structure and assets', async () => {
    const rawManifest = await readFile('manifest.webmanifest', 'utf8');
    const manifest = JSON.parse(rawManifest);

    assert.equal(manifest.name, 'DWithEase Discover');
    assert.equal(manifest.short_name, 'Discover');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, './');
    assert.ok(manifest.theme_color);
    assert.ok(manifest.background_color);
    assert.ok(Array.isArray(manifest.icons));
    assert.ok(manifest.icons.length >= 2);

    const icon192 = manifest.icons.find((icon) => icon.sizes === '192x192');
    const icon512 = manifest.icons.find((icon) => icon.sizes === '512x512');
    assert.ok(icon192, 'manifest includes 192x192 icon');
    assert.ok(icon512, 'manifest includes 512x512 icon');
});

test('validates service worker implementation and cache list', async () => {
    const swContent = await readFile('sw.js', 'utf8');

    assert.ok(swContent.includes("CACHE_NAME = 'dwithease-discover-v1'"));
    assert.ok(swContent.includes("addEventListener('install'"));
    assert.ok(swContent.includes("addEventListener('activate'"));
    assert.ok(swContent.includes("addEventListener('fetch'"));
    assert.ok(swContent.includes('manifest.webmanifest'));
    assert.ok(swContent.includes('assets/discover-page.js'));
    assert.ok(swContent.includes('assets/discover.css'));
    assert.ok(swContent.includes('assets/feed-model.js'));
});

test('index.html links to manifest and registers service worker', async () => {
    const html = await readFile('index.html', 'utf8');
    const { document } = parseHTML(html);

    const manifestLink = document.querySelector('link[rel="manifest"]');
    assert.ok(manifestLink, 'manifest link present');
    assert.equal(manifestLink.getAttribute('href'), 'manifest.webmanifest');

    const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]');
    assert.ok(appleTouchIcon, 'apple-touch-icon link present');

    assert.ok(html.includes("'serviceWorker' in navigator"));
    assert.ok(html.includes("navigator.serviceWorker.register('./sw.js')"));
});
