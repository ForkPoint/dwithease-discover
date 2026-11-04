import test from 'node:test';
import assert from 'node:assert/strict';

import { runValidateCandidatesCli, validateCandidateData } from '../scripts/validate-candidates.js';

const candidate = {
    id: 'salesforce-developers-blog-protect-scapi',
    type: 'article',
    title: 'Protect Your Salesforce Commerce API from Bots with eCDN',
    summary: 'Configure eCDN rules that stop scripted traffic before it reaches your B2C Commerce storefront APIs.',
    url: 'https://developer.salesforce.com/blogs/2026/11/protect-scapi',
    source: { name: 'Salesforce Developers Blog', url: 'https://developer.salesforce.com/blogs/feed' },
    publishedAt: '2026-11-03T10:00:00.000Z',
    tags: ['sfcc', 'developer-tools'],
    cta: { label: 'Read update' },
};

const idea = {
    id: 'a0BHp000019Okl7MAC',
    title: 'Tax Display on Product Lines for Receipts',
    ideaUrl: 'https://ideas.salesforce.com/s/idea/a0BHp000019Okl7MAC',
};

test('accepts valid RSS candidates and Salesforce ideas', () => {
    assert.deepEqual(validateCandidateData({ candidates: [candidate] }), []);
    assert.deepEqual(validateCandidateData({ candidates: [] }), []);
    assert.deepEqual(validateCandidateData({ ideas: [idea] }), []);
});

test('reports unsafe, duplicate, and malformed candidates', () => {
    const errors = validateCandidateData({
        candidates: [
            candidate,
            candidate,
            { ...candidate, id: 'plain-http', url: 'http://example.com/post' },
        ],
    });
    assert.equal(errors.length, 2);
    assert.match(errors[0], /duplicate/);
    assert.match(errors[1], /plain-http: .*HTTPS/);
});

test('reports malformed ideas and unknown files', () => {
    const errors = validateCandidateData({ ideas: [idea, { ...idea, id: 'A0BHP000019OKL7MAC' }, { id: 'x', title: '' }] });
    assert.match(errors[0], /duplicate/);
    assert.ok(errors.some((message) => /ideas\[2\] x: title/.test(message)));
    assert.ok(errors.some((message) => /ideas\[2\] x: ideaUrl/.test(message)));
    assert.deepEqual(validateCandidateData({}), ['expected a "candidates" or "ideas" array']);
});

test('the checked-in candidate files are valid', async () => {
    const errors = [];
    const ok = await runValidateCandidatesCli(['harvested-candidates.json', 'salesforce-ideas.json'], {
        log() {},
        error: (message) => errors.push(message),
    });
    assert.deepEqual(errors, []);
    assert.equal(ok, true);
});
