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
        issues: 'write',
    });
});

test('grants the scheduled RSS sources harvest write access', async () => {
    const workflow = parse(await readFile('.github/workflows/harvest-rss-sources.yml', 'utf8'));

    assert.deepEqual(workflow.on.schedule, [{ cron: '37 6 * * *' }]);
    assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'));
    assert.deepEqual(workflow.permissions, {
        contents: 'write',
        'pull-requests': 'write',
        issues: 'write',
    });
});


test('publishes a limited batch each weekday and starts the deploy', async () => {
    const workflow = parse(await readFile('.github/workflows/publish-feed.yml', 'utf8'));

    assert.deepEqual(workflow.on.schedule, [{ cron: '0 8 * * 1-5' }]);
    assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'));
    assert.deepEqual(workflow.permissions, { contents: 'write', actions: 'write', issues: 'write' });

    const run = workflow.jobs.publish.steps.map((step) => step.run ?? '').join('\n');
    assert.match(run, /npm run promote:feed -- --limit "\$PUBLISH_LIMIT"/);
    assert.match(run, /gh workflow run pages\.yml --ref main/);
});

const SCHEDULED = ['harvest-rss-sources', 'harvest-salesforce-ideas', 'publish-feed'];

function runText(workflow) {
    return Object.values(workflow.jobs)
        .flatMap((job) => job.steps)
        .map((step) => step.run ?? '')
        .join('\n');
}

for (const name of [...SCHEDULED, 'pages']) {
    test(`${name} opens or updates an issue when it fails`, async () => {
        const workflow = parse(await readFile(`.github/workflows/${name}.yml`, 'utf8'));
        const job = name === 'pages' ? workflow.jobs.deploy : Object.values(workflow.jobs)[0];
        const report = job.steps.at(-1);

        assert.equal(report.if, 'failure()');
        assert.match(report.run, /gh issue create/);
        assert.match(report.run, /gh issue comment/);
        assert.equal((job.permissions ?? workflow.permissions).issues, 'write');
    });
}

for (const name of ['harvest-rss-sources', 'harvest-salesforce-ideas']) {
    test(`${name} rebuilds its branch from main and still reports source failures`, async () => {
        const workflow = parse(await readFile(`.github/workflows/${name}.yml`, 'utf8'));
        const steps = workflow.jobs.harvest.steps;
        const run = runText(workflow);

        assert.doesNotMatch(run, /git rebase/);
        assert.match(run, /git switch -C "\$BRANCH" origin\/main/);
        assert.match(run, /--previous "\$RUNNER_TEMP\/previous.json"/);

        const harvest = steps.find(({ id }) => id === 'harvest');
        assert.equal(harvest['continue-on-error'], true);
        const gate = steps.find(({ if: condition }) => condition === "steps.harvest.outcome == 'failure'");
        assert.match(gate.run, /exit 1/);
        assert.ok(steps.indexOf(gate) > steps.findIndex(({ name: stepName }) => stepName === 'Open an update pull request'));
    });
}

test('publish-feed retries the push from the newest main', async () => {
    const workflow = parse(await readFile('.github/workflows/publish-feed.yml', 'utf8'));
    const run = runText(workflow);

    assert.match(run, /for attempt in 1 2 3/);
    assert.match(run, /git reset --hard origin\/main/);
});
