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

const SCHEDULED = ['harvest-rss-sources', 'harvest-salesforce-ideas', 'publish-feed', 'curation-reminder'];

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
        const check = steps.find(({ name: stepName }) => stepName === 'Check the harvested data');
        assert.match(check.run, /npm run validate:candidates -- \S+\.json/);
        assert.equal(check['continue-on-error'], undefined);
        assert.ok(steps.indexOf(check) > steps.indexOf(harvest));
        assert.ok(steps.indexOf(check) < steps.findIndex(({ name: stepName }) => stepName === 'Open an update pull request'));
        assert.equal(harvest['continue-on-error'], true);
        const gate = steps.find(({ if: condition }) => condition?.includes("steps.harvest.outcome == 'failure'"));
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

test('harvest-rss-sources queues trusted releases on main before the review branch', async () => {
    const workflow = parse(await readFile('.github/workflows/harvest-rss-sources.yml', 'utf8'));
    const steps = workflow.jobs.harvest.steps;
    const trusted = steps.find(({ id }) => id === 'trusted');
    const rebuild = steps.findIndex(({ name: stepName }) => stepName === 'Rebuild the candidate branch from main');
    const install = steps.findIndex(({ name: stepName }) => stepName === 'Install packages');

    assert.match(trusted.run, /npm run harvest:rss-sources -- --trusted-only/);
    assert.match(trusted.run, /npm run validate:feed -- feed-dev.json/);
    assert.match(trusted.run, /git push origin HEAD:main/);
    assert.equal(trusted['continue-on-error'], true);
    assert.ok(install < steps.indexOf(trusted) && steps.indexOf(trusted) < rebuild);
    const gate = steps.find(({ name: stepName }) => stepName === 'Fail when a source failed');
    assert.match(gate.if, /steps\.trusted\.outcome == 'failure'/);
});

test('curation-reminder runs each weekday and manages one issue', async () => {
    const workflow = parse(await readFile('.github/workflows/curation-reminder.yml', 'utf8'));
    const run = runText(workflow);

    assert.deepEqual(workflow.on.schedule, [{ cron: '0 7 * * 1-5' }]);
    assert.match(run, /npm run --silent curation:reminder -- harvested-candidates.json/);
    assert.match(run, /gh issue create/);
    assert.match(run, /gh issue close/);
});
