import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { validateFeed } from './feed-schema.ts';

const paths = process.argv.slice(2);

if (paths.length === 0) {
    console.error('Usage: npm run validate:feed -- <feed.json> [feed.json]');
    process.exitCode = 2;
} else {
    let failed = false;

    for (const path of paths) {
        try {
            const input: unknown = JSON.parse(await readFile(path, 'utf8'));
            const result = validateFeed(input);

            if (result.success) {
                console.log(`${basename(path)}: valid`);
                continue;
            }

            failed = true;
            for (const error of result.errors) {
                console.error(`${basename(path)}: ${error.path}: ${error.message}`);
            }
        } catch (error) {
            failed = true;
            const message = error instanceof Error ? error.message : String(error);
            console.error(`${basename(path)}: ${message}`);
        }
    }

    if (failed) {
        process.exitCode = 1;
    }
}
