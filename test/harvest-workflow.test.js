import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { parse } from 'yaml';

test('runs the Salesforce Commerce harvest each day and on demand', async () => {
    const workflow = parse(await readFile('.github/workflows/harvest-salesforce-ideas.yml', 'utf8'));

    assert.deepEqual(workflow.on.schedule, [{ cron: '17 6 * * *' }]);
    assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'));
    assert.deepEqual(workflow.permissions, {
        contents: 'write',
        'pull-requests': 'write',
    });

    const commands = workflow.jobs.harvest.steps.flatMap(({ run }) => run
        ? run.split('\n').map((command) => command.trim()).filter(Boolean)
        : []);

    assert.ok(commands.includes('npx playwright-core install --with-deps chromium'));
    assert.ok(commands.includes('npm run harvest:salesforce-ideas'));
    assert.ok(commands.includes('if git diff --quiet -- salesforce-ideas.json; then'));
    assert.ok(commands.some((command) => command.includes('gh pr create')));
});
