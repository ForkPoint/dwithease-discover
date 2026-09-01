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
        version: '1.0.0',
        description: 'Public commerce articles, news, and DWithEase product promotions. The Zod runtime also rejects duplicate item IDs and campaign end dates that do not follow their start dates.',
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
                description: 'Returns approved editorial items and active or scheduled product promotions.',
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
                description: 'The complete Discover feed document.',
                ...discoverFeedSchema,
            },
        },
    },
};

await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`);
console.log(`${outputPath}: written`);
