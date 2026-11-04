import test from 'node:test';
import assert from 'node:assert/strict';

import { carryOverIdeas, makeCandidate, mergeCandidates } from '../scripts/harvest-salesforce-ideas.js';

const row = {
    availability: "Spring '26",
    cloud: 'Commerce',
    ideaId: 'a0BTest123',
    ideaName: 'USD Nickel Rounding Feature',
    points: 40,
    releaseNotesUrl: 'https://help.salesforce.com/s/articleView?id=release-notes.test',
};

test('turns a delivered Commerce idea into a review candidate', () => {
    assert.deepEqual(makeCandidate(row), {
        id: 'a0BTest123',
        title: 'USD Nickel Rounding Feature',
        availability: "Spring '26",
        points: 40,
        ideaUrl: 'https://ideas.salesforce.com/s/idea/a0BTest123',
        releaseNotesUrl: row.releaseNotesUrl,
    });
});

test('adds each candidate once without changing the Discover feed', () => {
    const catalog = {
        source: 'https://ideas.salesforce.com/s/insights',
        harvestedAt: '2026-09-01T00:00:00Z',
        ideas: [],
    };
    const first = mergeCandidates(catalog, [row, row], '2026-09-10T08:00:00.000Z');
    const second = mergeCandidates(first.catalog, [{ ...row, ideaId: 'A0BTEST123' }], '2026-09-11T08:00:00.000Z');
    assert.equal(first.additions.length, 1);
    assert.deepEqual(first.catalog.ideas.map(({ id }) => id), ['a0BTest123']);
    assert.equal(second.additions.length, 0);
    assert.equal(second.catalog.harvestedAt, '2026-09-10T08:00:00.000Z');
});


test('carries over ideas from an unmerged bot branch once', () => {
    const main = { source: 'x', harvestedAt: '2026-09-01T00:00:00Z', ideas: [{ id: 'a0BOld' }] };
    const branch = { source: 'x', harvestedAt: '2026-09-05T00:00:00Z', ideas: [{ id: 'a0BNew' }, { id: 'A0BOLD' }] };

    const merged = carryOverIdeas(main, branch);
    assert.deepEqual(merged.ideas.map(({ id }) => id), ['a0BNew', 'a0BOld']);
    assert.equal(merged.harvestedAt, '2026-09-05T00:00:00Z');
    assert.equal(carryOverIdeas(main, undefined), main);
});
