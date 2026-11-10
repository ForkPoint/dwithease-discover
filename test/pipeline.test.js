import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runCurateCli } from '../scripts/curate.js';
import { FeedSchema } from '../scripts/feed-schema.ts';
import { isSfccRelated, runHarvestCli } from '../scripts/harvest-rss-sources.js';
import { runPromoteCli } from '../scripts/promote-feed.js';

const SOURCE = {
    name: 'Salesforce Developers Blog',
    url: 'https://developer.salesforce.com/blogs/feed',
    feedUrl: 'https://developer.salesforce.com/blogs/feed',
    type: 'rss',
    tags: ['sfcc', 'developer-tools', 'salesforce'],
    filter: isSfccRelated,
};

const daysAgo = (days) => new Date(Date.now() - days * 86_400_000).toUTCString();

function rssItem(slug, title, description, pubDate) {
    return `<item><title>${title}</title><link>https://developer.salesforce.com/blogs/2026/10/${slug}</link>`
        + `<pubDate>${pubDate}</pubDate><description>${description}</description></item>`;
}

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
${rssItem('ecdn-rate-limits', 'Rate Limiting Shoppers with B2C Commerce eCDN', 'Configure firewall rules that protect your storefront login from automated abuse and scripted attacks.', daysAgo(40))}
${rssItem('pwa-kit-caching', 'Caching Strategies for PWA Kit Storefronts', 'Learn how to tune Managed Runtime caching so your composable storefront pages load faster for shoppers.', daysAgo(39))}
${rssItem('sfra-checkout', 'Extending SFRA Checkout Without Forking Cartridges', 'Use hooks to customize the SFRA checkout flow while keeping your cartridge stack easy to upgrade later.', daysAgo(38))}
${rssItem('devops-center', 'Testing and Quality Gates in DevOps Center', 'Automate tests and enforce quality gates in DevOps Center before changes reach your production org.', daysAgo(37))}
</channel></rss>`;

const quiet = { write() {} };

async function readJson(path) {
    return JSON.parse(await readFile(path, 'utf8'));
}

test('harvest, curate, and publish move only reviewed SFCC items to the live feed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'discover-pipeline-'));
    try {
        const paths = {
            candidates: join(dir, 'harvested-candidates.json'),
            rejected: join(dir, 'rejected-candidates.json'),
            dev: join(dir, 'feed-dev.json'),
            live: join(dir, 'feed-live.json'),
            rss: join(dir, 'rss.xml'),
            atom: join(dir, 'atom.xml'),
        };
        const emptyFeed = { locale: 'en', updatedAt: '2026-10-01T00:00:00Z', items: [] };
        await writeFile(paths.dev, JSON.stringify(emptyFeed));
        await writeFile(paths.live, JSON.stringify(emptyFeed));
        const harvest = () => runHarvestCli([paths.candidates], {
            sources: [SOURCE],
            fetchImpl: async () => new Response(RSS),
            log() {},
        });

        // 1. Harvest keeps the 3 SFCC posts and drops the general DevOps post.
        await harvest();
        const candidates = (await readJson(paths.candidates)).candidates;
        assert.ok(candidates.every(({ harvestedAt }) => Date.parse(harvestedAt) > 0));
        assert.deepEqual(candidates.map(({ title }) => title).sort(), [
            'Caching Strategies for PWA Kit Storefronts',
            'Extending SFRA Checkout Without Forking Cartridges',
            'Rate Limiting Shoppers with B2C Commerce eCDN',
        ]);

        // 2. Curate: accept 2, reject 1.
        const idOf = (fragment) => candidates.find(({ title }) => title.includes(fragment)).id;
        const curate = (action, fragment) => runCurateCli(
            ['--candidates', paths.candidates, '--feed', paths.dev, `--${action}`, idOf(fragment)],
            { stdin: { isTTY: false }, stdout: quiet },
        );
        await curate('accept', 'eCDN');
        await curate('accept', 'PWA Kit');
        await curate('reject', 'SFRA');
        assert.equal((await readJson(paths.candidates)).candidates.length, 0);

        // 3. A second harvest adds nothing back: accepted items are queued, the rejected one is remembered.
        const second = await harvest();
        assert.equal(second.additions.length, 0);

        // 4. Publish one item per run, oldest first.
        const publish = () => runPromoteCli(
            ['--from', paths.dev, '--to', paths.live, '--rss', paths.rss, '--atom', paths.atom, '--limit', '1'],
            { stdout: quiet },
        );
        await publish();
        let live = await readJson(paths.live);
        assert.deepEqual(live.items.map(({ title }) => title), ['Rate Limiting Shoppers with B2C Commerce eCDN']);

        await publish();
        await publish();
        live = await readJson(paths.live);
        assert.equal(live.items.length, 2);
        FeedSchema.parse(live);
        const rss = await readFile(paths.rss, 'utf8');
        assert.match(rss, /Caching Strategies for PWA Kit Storefronts/);
        assert.doesNotMatch(rss, /SFRA Checkout/);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
