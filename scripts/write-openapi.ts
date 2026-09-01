import { writeFile } from 'node:fs/promises';

import { z } from 'zod';

import { FeedSchema } from './feed-schema.ts';

const outputPath = process.argv[2] ?? 'openapi.json';
const { $schema: _jsonSchemaDialect, ...discoverFeedSchema } = z.toJSONSchema(FeedSchema, {
    target: 'draft-2020-12',
});

const feedResponse = (description: string) => ({
    description,
    content: {
        'application/json': {
            schema: {
                $ref: '#/components/schemas/DiscoverFeed',
            },
        },
    },
});

const document = {
    openapi: '3.1.1',
    info: {
        title: 'DWithEase Discover Feed API',
        version: '2.0.0',
        description: 'Version 2 contract for the development feed and the planned live feed. The live endpoint keeps its legacy response during curation. The Zod runtime also rejects duplicate item IDs and campaign end dates that do not follow their start dates.',
    },
    tags: [
        {
            name: 'Feeds',
            description: 'Read-only JSON feeds for Discover clients.',
        },
    ],
    paths: {
        '/feed-live.json': {
            get: {
                operationId: 'getLiveDiscoverFeed',
                summary: 'Get the live Discover feed',
                description: 'Defines the planned version 2 response after curation. The current endpoint keeps its legacy response until the development corpus is approved.',
                tags: ['Feeds'],
                responses: {
                    '200': feedResponse('The public Discover feed.'),
                },
            },
        },
        '/feed-dev.json': {
            get: {
                operationId: 'getDevelopmentDiscoverFeed',
                summary: 'Get the development Discover feed',
                description: 'Returns approved content, promotions, and unapproved gather candidates for review.',
                tags: ['Feeds'],
                responses: {
                    '200': feedResponse('The development Discover feed.'),
                },
            },
        },
    },
    components: {
        schemas: {
            DiscoverFeed: {
                title: 'Discover Feed',
                description: 'The complete version 2 Discover document.',
                ...discoverFeedSchema,
            },
        },
    },
};

await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`);
console.log(`${outputPath}: written`);
