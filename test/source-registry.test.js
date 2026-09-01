import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';

import { buildSourceRegistry } from '../assets/feed-model.js';

const PAGE_URL = 'https://discover.dwithease.com/';
const REGISTRY_URL = `${PAGE_URL}sources.json`;

test('validates the published source registry from the command line', () => {
    const result = spawnSync(process.execPath, ['scripts/validate-sources.js'], {
        cwd: process.cwd(),
        encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /sources\.json: valid/);
});

test('covers each feed source with a local checked-in icon', async () => {
    const rawRegistry = JSON.parse(await readFile('sources.json', 'utf8'));
    const feed = JSON.parse(await readFile('feed-dev.json', 'utf8'));
    const registry = buildSourceRegistry(rawRegistry, REGISTRY_URL, PAGE_URL);
    const feedSources = new Map(feed.items.map(({ source }) => [source.url, source.name]));

    assert.equal(rawRegistry.sources.length, feedSources.size);
    assert.deepEqual([...registry.keys()].sort(), [...feedSources.keys()].sort());

    for (const source of rawRegistry.sources) {
        assert.equal(source.name, feedSources.get(source.url));
        assert.equal(registry.get(source.url).icon, new URL(source.icon, REGISTRY_URL).href);
        await access(source.icon);
    }

    await access('assets/sources/source-fallback.svg');
});

test('resolves safe icon paths from the registry response URL', () => {
    const registry = buildSourceRegistry({
        sources: [{
            name: 'Example',
            url: 'https://example.com/news/',
            icon: 'assets/sources/example.svg',
        }],
    }, 'https://discover.example/catalog/sources.json', 'https://discover.example/');

    assert.equal(
        registry.get('https://example.com/news/').icon,
        'https://discover.example/catalog/assets/sources/example.svg',
    );
});

test('rejects unsafe source registries', () => {
    const source = {
        name: 'Example',
        url: 'https://example.com/news/',
        icon: 'assets/sources/example.svg',
    };

    for (const icon of [
        '../example.svg',
        '/assets/sources/example.svg',
        'assets/sources/../example.svg',
        'assets/sources/example.svg?remote=1',
        'https://example.com/icon.svg',
    ]) {
        assert.throws(() => buildSourceRegistry({
            sources: [{ ...source, icon }],
        }, REGISTRY_URL, PAGE_URL), /Invalid source registry entry/);
    }

    assert.throws(() => buildSourceRegistry({
        sources: [{ ...source, extra: true }],
    }, REGISTRY_URL, PAGE_URL), /Invalid source registry entry/);
    assert.throws(() => buildSourceRegistry({
        sources: [source, { ...source }],
    }, REGISTRY_URL, PAGE_URL), /Invalid source registry entry/);
    assert.throws(() => buildSourceRegistry({ sources: [source] },
        'https://other.example/sources.json', PAGE_URL), /page origin/);
});
