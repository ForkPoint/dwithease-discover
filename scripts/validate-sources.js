import { access, readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

import { buildSourceRegistry } from '../assets/feed-model.js';

const [registryPath = 'sources.json', ...requestedFeedPaths] = process.argv.slice(2);
const feedPaths = requestedFeedPaths.length
    ? requestedFeedPaths
    : ['feed-live.json', 'feed-dev.json'];
const pageUrl = 'https://discover.dwithease.com/';

try {
    const rawRegistry = JSON.parse(await readFile(registryPath, 'utf8'));
    const registryUrl = new URL(basename(registryPath), pageUrl).href;
    const registry = buildSourceRegistry(rawRegistry, registryUrl, pageUrl);
    const feedSources = new Map();

    for (const feedPath of feedPaths) {
        const feed = JSON.parse(await readFile(feedPath, 'utf8'));
        if (!Array.isArray(feed.items)) throw new TypeError(`${basename(feedPath)} has no items array`);
        for (const { source } of feed.items) {
            if (feedSources.has(source.url) && feedSources.get(source.url) !== source.name) {
                throw new TypeError(`Source name mismatch for ${source.url}`);
            }
            feedSources.set(source.url, source.name);
        }
    }

    if (registry.size !== feedSources.size) {
        throw new TypeError('Source registry does not match the public feeds');
    }

    for (const source of rawRegistry.sources) {
        if (feedSources.get(source.url) !== source.name) {
            throw new TypeError(`Missing source registry entry for ${source.url}`);
        }
        await access(resolve(dirname(registryPath), source.icon));
    }

    console.log(`${basename(registryPath)}: valid`);
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${basename(registryPath)}: ${message}`);
    process.exitCode = 1;
}
