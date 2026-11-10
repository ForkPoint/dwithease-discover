import test from 'node:test';
import assert from 'node:assert/strict';

import { ageWarning } from '../scripts/curate.js';
import { queuedItems, reminderBody, staleCandidates } from '../scripts/curation-reminder.js';

const NOW = Date.parse('2026-11-10T00:00:00Z');

test('staleCandidates returns candidates that waited longer than 3 days', () => {
    const candidates = [
        { id: 'fresh', harvestedAt: '2026-11-09T00:00:00Z' },
        { id: 'stale', harvestedAt: '2026-11-06T00:00:00Z' },
        { id: 'unstamped' },
    ];
    assert.deepEqual(staleCandidates(candidates, NOW).map(({ id }) => id), ['stale', 'unstamped']);
});

test('ageWarning flags articles close to the extension window', () => {
    assert.equal(ageWarning({ publishedAt: '2026-10-20T00:00:00Z' }, NOW), null);
    assert.match(ageWarning({ publishedAt: '2026-09-20T00:00:00Z' }, NOW), /published 51 days ago.*older than 60 days/);
});

test('queuedItems lists editorial items not yet live', () => {
    const dev = [{ type: 'article', url: 'https://a' }, { type: 'news', url: 'https://b' }, { type: 'promotion', url: 'https://p' }];
    assert.deepEqual(queuedItems(dev, [{ url: 'https://a' }]).map(({ url }) => url), ['https://b']);
});

test('reminderBody stays empty while the queue has items and nothing is stale', () => {
    const body = reminderBody({
        candidates: [{ id: 'fresh', title: 'Fresh', harvestedAt: '2026-11-09T00:00:00Z' }],
        devItems: [{ type: 'article', url: 'https://queued' }],
    }, NOW);
    assert.equal(body, '');
});

test('reminderBody reports an empty queue even when nothing is stale', () => {
    const dry = reminderBody({ candidates: [], devItems: [], liveItems: [] }, NOW);
    assert.match(dry, /queue is empty and the harvesters found nothing new/);

    const waiting = reminderBody({ candidates: [{ id: 'fresh', title: 'Fresh', harvestedAt: '2026-11-09T00:00:00Z' }] }, NOW);
    assert.match(waiting, /queue is empty\. Curate/);
});

test('reminderBody lists stale candidates and bot PRs', () => {
    const body = reminderBody({
        candidates: [{ id: 'old', title: 'Old post', harvestedAt: '2026-11-01T00:00:00Z' }],
        devItems: [{ type: 'article', url: 'https://queued' }],
        stalePrs: '- #12 data: harvest RSS sources',
    }, NOW);
    assert.match(body, /waited longer than 3 days/);
    assert.match(body, /- Old post \(old\)/);
    assert.match(body, /- #12 data: harvest RSS sources/);
});
