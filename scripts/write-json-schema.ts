import { writeFile } from 'node:fs/promises';

import { z } from 'zod';

import { FeedSchema } from './feed-schema.ts';

const outputPath = process.argv[2] ?? 'feed.schema.json';
const schema = {
    ...z.toJSONSchema(FeedSchema, { target: 'draft-2020-12' }),
    $id: 'https://discover.dwithease.com/feed.schema.json',
    title: 'DWithEase Discover Feed',
};

await writeFile(outputPath, `${JSON.stringify(schema, null, 2)}\n`);
console.log(`${outputPath}: written`);
