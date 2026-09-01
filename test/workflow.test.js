import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { parse } from 'yaml';

function commands(job) {
    return job.steps.flatMap(({ run }) => (typeof run === 'string'
        ? run.split('\n').map((command) => command.trim()).filter(Boolean)
        : []));
}

function actions(job) {
    return job.steps.flatMap(({ uses }) => (uses ? [uses] : []));
}

test('validates pull requests and deploys only main pushes', async () => {
    const workflow = parse(await readFile('.github/workflows/pages.yml', 'utf8'));

    assert.deepEqual(workflow.on.push.branches, ['main']);
    assert.deepEqual(workflow.on.pull_request.branches, ['main']);
    assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'));
    assert.deepEqual(workflow.permissions, { contents: 'read' });

    assert.deepEqual(actions(workflow.jobs.validate), [
        'actions/checkout@v6',
        'actions/setup-node@v6',
        'actions/upload-pages-artifact@v4',
    ]);
    assert.deepEqual(commands(workflow.jobs.validate), [
        'npm ci',
        'npm run write:schema',
        'npm run write:openapi',
        'npm test',
        'npm run typecheck',
        'npm run validate:feed -- feed-live.json feed-dev.json',
        'npm run validate:sources',
        'mkdir _site',
        'cp index.html schema.html openapi.json feed.schema.json sources.json CNAME .nojekyll feed-live.json feed-dev.json _site/',
        'cp -R assets _site/assets',
    ]);

    const deploy = workflow.jobs.deploy;
    assert.equal(deploy.needs, 'validate');
    assert.equal(
        deploy.if,
        "${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}",
    );
    assert.deepEqual(deploy.permissions, {
        contents: 'read',
        pages: 'write',
        'id-token': 'write',
    });
    assert.deepEqual(actions(deploy), [
        'actions/configure-pages@v5',
        'actions/deploy-pages@v4',
    ]);
});
