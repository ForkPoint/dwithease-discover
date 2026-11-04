import test from 'node:test';
import assert from 'node:assert/strict';

import { ageWarning } from '../scripts/curate.js';
import { staleCandidates } from '../scripts/curation-reminder.js';

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
