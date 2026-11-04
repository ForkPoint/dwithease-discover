import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

import { normalizeCuratedItem } from './curate.js';
import { FeedItemSchema } from './feed-schema.ts';

const HttpsUrl = z.string().regex(/^https:\/\/\S+$/);

const IdeaSchema = z.object({
    id: z.string().regex(/^[A-Za-z0-9]+$/),
    title: z.string().trim().min(1),
    ideaUrl: HttpsUrl,
    releaseNotesUrl: HttpsUrl.optional(),
});

// Returns one message per problem, so a bad harvest is stopped before its PR opens.
export function validateCandidateData(data) {
    const errors = [];
    const seen = new Set();
    const checkUnique = (key, label) => {
        if (seen.has(key)) errors.push(`${label}: duplicate`);
        seen.add(key);
    };

    if (Array.isArray(data?.candidates)) {
        data.candidates.forEach((candidate, index) => {
            const label = `candidates[${index}] ${candidate?.id ?? ''}`.trim();
            checkUnique(candidate?.url, label);
            try {
                // A candidate is valid when accepting it as-is yields a schema-valid feed item.
                FeedItemSchema.parse(normalizeCuratedItem(candidate));
            } catch (error) {
                errors.push(`${label}: ${error.message.split('\n')[0]}`);
            }
        });
    } else if (Array.isArray(data?.ideas)) {
        data.ideas.forEach((idea, index) => {
            const label = `ideas[${index}] ${idea?.id ?? ''}`.trim();
            checkUnique(idea?.id?.toLowerCase(), label);
            const result = IdeaSchema.safeParse(idea);
            if (!result.success) {
                for (const issue of result.error.issues) errors.push(`${label}: ${issue.path.join('.')}: ${issue.message}`);
            }
        });
    } else {
        errors.push('expected a "candidates" or "ideas" array');
    }

    return errors;
}

export async function runValidateCandidatesCli(paths = process.argv.slice(2), { log = console.log, error = console.error } = {}) {
    let failed = false;
    for (const path of paths) {
        let errors;
        try {
            errors = validateCandidateData(JSON.parse(await readFile(path, 'utf8')));
        } catch (err) {
            errors = [err.message];
        }
        if (errors.length === 0) {
            log(`${basename(path)}: valid`);
        } else {
            failed = true;
            for (const message of errors) error(`${basename(path)}: ${message}`);
        }
    }
    return !failed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (!(await runValidateCandidatesCli())) process.exitCode = 1;
}
