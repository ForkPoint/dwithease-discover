import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const STALE_DAYS = 3;

// Candidates without a harvestedAt stamp predate the stamp and count as waiting.
export function staleCandidates(candidates, nowMs = Date.now(), staleDays = STALE_DAYS) {
    const cutoff = nowMs - staleDays * 86_400_000;
    return candidates.filter(({ harvestedAt }) => !harvestedAt || Date.parse(harvestedAt) <= cutoff);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const path = process.argv[2] ?? 'harvested-candidates.json';
    const { candidates = [] } = JSON.parse(await readFile(path, 'utf8'));
    for (const candidate of staleCandidates(candidates)) console.log(`- ${candidate.title} (${candidate.id})`);
}
