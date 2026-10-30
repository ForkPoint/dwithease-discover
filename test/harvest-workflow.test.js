import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { parse } from 'yaml';

test('grants the scheduled Salesforce harvest write access', async () => {
    const workflow = parse(await readFile('.github/workflows/harvest-salesforce-ideas.yml', 'utf8'));

    assert.deepEqual(workflow.on.schedule, [{ cron: '17 6 * * *' }]);
    assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'));
    assert.deepEqual(workflow.permissions, {
        contents: 'write',
        'pull-requests': 'write',
    });
});

test('grants the scheduled RSS sources harvest write access', async () => {
    const workflow = parse(await readFile('.github/workflows/harvest-rss-sources.yml', 'utf8'));

    assert.deepEqual(workflow.on.schedule, [{ cron: '37 6 * * *' }]);
    assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'));
    assert.deepEqual(workflow.permissions, {
        contents: 'write',
        'pull-requests': 'write',
    });
});


test('publishes a limited batch each weekday and starts the deploy', async () => {
    const workflow = parse(await readFile('.github/workflows/publish-feed.yml', 'utf8'));

    assert.deepEqual(workflow.on.schedule, [{ cron: '0 8 * * 1-5' }]);
    assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'));
    assert.deepEqual(workflow.permissions, { contents: 'write', actions: 'write' });

    const run = workflow.jobs.publish.steps.map((step) => step.run ?? '').join('\n');
    assert.match(run, /npm run promote:feed -- --limit "\$PUBLISH_LIMIT"/);
    assert.match(run, /gh workflow run pages\.yml --ref main/);
});
