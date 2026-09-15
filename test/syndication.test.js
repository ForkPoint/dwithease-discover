import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { escapeXml, generateAtom, generateRss } from '../scripts/write-syndication.ts';
import { FeedSchema } from '../scripts/feed-schema.ts';

test('escapes special XML characters', () => {
    assert.equal(escapeXml('AT&T <test> "quotes" \'single\''), 'AT&amp;T &lt;test&gt; &quot;quotes&quot; &apos;single&apos;');
});

test('generates valid RSS 2.0 with proper channel and item tags', async () => {
    const raw = JSON.parse(await readFile('feed-live.json', 'utf8'));
    const feed = FeedSchema.parse(raw);
    const rss = generateRss(feed);

    assert.ok(rss.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.match(rss, /<rss version="2.0" xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom">/);
    assert.match(rss, /<title>DWithEase Discover<\/title>/);
    assert.match(rss, /<atom:link href="https:\/\/discover\.dwithease\.com\/rss\.xml" rel="self" type="application\/rss\+xml"\/>/);
    assert.match(rss, /<item>/);
    assert.match(rss, /<guid isPermaLink="false">promotion-agentic-storefront-audit<\/guid>/);
    assert.match(rss, /<source url="https:\/\/audit\.agenticstorefront\.com\/">Agentic Storefront Audit<\/source>/);
    assert.match(rss, /<category>agentic-commerce<\/category>/);
});

test('generates valid Atom 1.0 with proper feed and entry tags', async () => {
    const raw = JSON.parse(await readFile('feed-live.json', 'utf8'));
    const feed = FeedSchema.parse(raw);
    const atom = generateAtom(feed);

    assert.ok(atom.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.match(atom, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/);
    assert.match(atom, /<id>https:\/\/discover\.dwithease\.com\/<\/id>/);
    assert.match(atom, /<link href="https:\/\/discover\.dwithease\.com\/atom\.xml" rel="self" type="application\/atom\+xml"\/>/);
    assert.match(atom, /<entry>/);
    assert.match(atom, /<id>https:\/\/discover\.dwithease\.com\/#promotion-agentic-storefront-audit<\/id>/);
    assert.match(atom, /<author>\s*<name>Agentic Storefront Audit<\/name>/);
    assert.match(atom, /<category term="agentic-commerce"\/>/);
});
