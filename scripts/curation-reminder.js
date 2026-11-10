import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const STALE_DAYS = 3;

// Candidates without a harvestedAt stamp predate the stamp and count as waiting.
export function staleCandidates(candidates, nowMs = Date.now(), staleDays = STALE_DAYS) {
    const cutoff = nowMs - staleDays * 86_400_000;
    return candidates.filter(({ harvestedAt }) => !harvestedAt || Date.parse(harvestedAt) <= cutoff);
}

// Editorial items in the dev feed that the publish job has not moved to the live feed yet.
export function queuedItems(devItems = [], liveItems = []) {
    const live = new Set(liveItems.map(({ url }) => url));
    return devItems.filter(({ type, url }) => type !== 'promotion' && !live.has(url));
}

// Returns the issue body, or an empty string when nothing needs attention.
export function reminderBody({ candidates = [], devItems = [], liveItems = [], stalePrs = '' }, nowMs = Date.now()) {
    const stale = staleCandidates(candidates, nowMs);
    const queueEmpty = queuedItems(devItems, liveItems).length === 0;
    if (stale.length === 0 && !stalePrs && !queueEmpty) return '';

    const sections = [];
    if (queueEmpty) {
        sections.push(candidates.length > 0 || stalePrs
            ? 'The publish queue is empty. Curate the items below so the next publish run has something to send.'
            : 'The publish queue is empty and the harvesters found nothing new. Add articles by hand with `npm run curate`.');
    } else {
        sections.push(`These items have waited longer than ${STALE_DAYS} days. The publish queue empties without curation.`);
    }
    const lines = stale.map(({ title, id }) => `- ${title} (${id})`).join('\n');
    sections.push(`Candidates (run \`npm run curate\`):\n${lines || '- none'}`);
    sections.push(`Bot PRs to review:\n${stalePrs || '- none'}`);
    return `${sections.join('\n\n')}\n`;
}

async function readJson(path, fallback) {
    try {
        return JSON.parse(await readFile(path, 'utf8'));
    } catch {
        return fallback;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [candidatesPath = 'harvested-candidates.json', devPath = 'feed-dev.json', livePath = 'feed-live.json'] = process.argv.slice(2);
    process.stdout.write(reminderBody({
        candidates: (await readJson(candidatesPath, {})).candidates,
        devItems: (await readJson(devPath, {})).items,
        liveItems: (await readJson(livePath, {})).items,
        stalePrs: process.env.STALE_PRS?.trim(),
    }));
}
