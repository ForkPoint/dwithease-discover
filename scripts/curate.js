import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { cleanText, slugify } from './harvest-rss-sources.js';

export function normalizeTag(tag) {
    return slugify(tag).slice(0, 32);
}

export function normalizeTags(tags = []) {
    const set = new Set();
    for (const tag of tags) {
        const cleaned = normalizeTag(tag);
        if (cleaned) {
            set.add(cleaned);
        }
    }
    const result = Array.from(set).slice(0, 8);
    return result.length > 0 ? result : ['commerce'];
}

export function normalizeCuratedItem(candidate, overrides = {}) {
    const rawTitle = overrides.title ?? candidate.title ?? '';
    const cleanTitle = cleanText(rawTitle).slice(0, 120);

    const rawSummary = overrides.summary ?? candidate.summary ?? candidate.title ?? '';
    const cleanSummary = cleanText(rawSummary).slice(0, 280);

    const tags = normalizeTags(overrides.tags ?? candidate.tags ?? ['commerce']);

    const rawId = overrides.id ?? candidate.id ?? slugify(`${candidate.source?.name || 'article'}-${cleanTitle}`);
    const id = slugify(rawId).slice(0, 120);

    const url = overrides.url ?? candidate.url;
    if (!url || !url.startsWith('https://')) {
        throw new Error(`Candidate must have a valid HTTPS URL: ${url}`);
    }

    const sourceName = cleanText(overrides.sourceName ?? candidate.source?.name ?? 'External Source').slice(0, 80);
    const sourceUrl = overrides.sourceUrl ?? candidate.source?.url ?? new URL(url).origin + '/';

    const publishedAt = overrides.publishedAt ?? candidate.publishedAt ?? new Date().toISOString();

    const ctaLabel = cleanText(overrides.ctaLabel ?? candidate.cta?.label ?? 'Read update').slice(0, 32);

    return {
        id,
        type: 'article',
        title: cleanTitle,
        summary: cleanSummary,
        url,
        source: {
            name: sourceName,
            url: sourceUrl,
        },
        publishedAt,
        tags,
        cta: {
            label: ctaLabel || 'Read update',
        },
    };
}

export function addItemToFeed(feed, item) {
    const updated = {
        ...feed,
        updatedAt: new Date().toISOString(),
        items: [...feed.items],
    };

    const existingIndex = updated.items.findIndex(
        (existing) => existing.id === item.id || existing.url === item.url
    );

    if (existingIndex >= 0) {
        throw new Error(`Feed already contains an item with ID "${item.id}" or URL "${item.url}"`);
    }

    // Insert after promotions, ordered by publishedAt descending among editorial items
    const promoCount = updated.items.filter((i) => i.type === 'promotion').length;
    const editorialItems = updated.items.slice(promoCount);

    const newDate = new Date(item.publishedAt).getTime();
    let insertIndex = 0;
    while (
        insertIndex < editorialItems.length &&
        new Date(editorialItems[insertIndex].publishedAt).getTime() >= newDate
    ) {
        insertIndex++;
    }

    updated.items.splice(promoCount + insertIndex, 0, item);
    return updated;
}

export async function loadCandidates(filePath) {
    try {
        const content = await readFile(filePath, 'utf8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) return parsed;
        if (Array.isArray(parsed.candidates)) return parsed.candidates;
        if (Array.isArray(parsed.ideas)) {
            // Support salesforce-ideas format as candidate input
            return parsed.ideas.map((idea) => ({
                id: slugify(`salesforce-idea-${idea.title || idea.id}`),
                type: 'article',
                title: idea.title,
                summary: `Delivered Salesforce Commerce Idea (${idea.availability || 'Delivered'}, ${idea.points || 0} points).`,
                url: idea.releaseNotesUrl || idea.ideaUrl,
                source: {
                    name: 'Salesforce IdeaExchange',
                    url: 'https://ideas.salesforce.com/',
                },
                publishedAt: new Date().toISOString(),
                tags: ['sfcc', 'ideaexchange', 'commerce'],
                cta: { label: 'View idea' },
            }));
        }
        return [];
    } catch {
        return [];
    }
}

export async function saveCandidates(filePath, candidates) {
    const output = {
        harvestedAt: new Date().toISOString(),
        candidates,
    };
    await writeFile(filePath, `${JSON.stringify(output, null, 2)}\n`);
}

export async function curateCandidate({
    candidate,
    action,
    overrides = {},
    feed,
    candidates,
}) {
    if (action === 'accept') {
        const item = normalizeCuratedItem(candidate, overrides);
        const updatedFeed = addItemToFeed(feed, item);
        const updatedCandidates = candidates.filter(
            (c) => c.id !== candidate.id && c.url !== candidate.url
        );
        return {
            item,
            feed: updatedFeed,
            candidates: updatedCandidates,
        };
    }

    if (action === 'reject') {
        const updatedCandidates = candidates.filter(
            (c) => c.id !== candidate.id && c.url !== candidate.url
        );
        return {
            item: null,
            feed,
            candidates: updatedCandidates,
        };
    }

    return {
        item: null,
        feed,
        candidates,
    };
}

export async function runCurateCli(args = process.argv.slice(2), { stdin = process.stdin, stdout = process.stdout } = {}) {
    let candidatesPath = 'harvested-candidates.json';
    let feedPath = 'feed-dev.json';
    let listOnly = false;
    let acceptTarget = null;
    let rejectTarget = null;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--candidates' && args[i + 1]) {
            candidatesPath = args[++i];
        } else if (args[i] === '--feed' && args[i + 1]) {
            feedPath = args[++i];
        } else if (args[i] === '--list') {
            listOnly = true;
        } else if (args[i] === '--accept' && args[i + 1]) {
            acceptTarget = args[++i];
        } else if (args[i] === '--reject' && args[i + 1]) {
            rejectTarget = args[++i];
        }
    }

    let candidates = await loadCandidates(candidatesPath);
    const feedContent = await readFile(feedPath, 'utf8');
    let feed = JSON.parse(feedContent);

    if (listOnly) {
        stdout.write(`Found ${candidates.length} candidate(s) in ${candidatesPath}:\n\n`);
        candidates.forEach((c, index) => {
            stdout.write(`[${index + 1}] ${c.title}\n`);
            stdout.write(`    ID:     ${c.id}\n`);
            stdout.write(`    Source: ${c.source?.name} (${c.url})\n`);
            stdout.write(`    Tags:   ${(c.tags || []).join(', ')}\n\n`);
        });
        return;
    }

    if (acceptTarget) {
        const match = candidates.find((c) => c.id === acceptTarget || c.url === acceptTarget);
        if (!match) {
            stdout.write(`Candidate "${acceptTarget}" not found in ${candidatesPath}.\n`);
            return;
        }
        const result = await curateCandidate({ candidate: match, action: 'accept', feed, candidates });
        feed = result.feed;
        candidates = result.candidates;
        await writeFile(feedPath, `${JSON.stringify(feed, null, 2)}\n`);
        await saveCandidates(candidatesPath, candidates);
        stdout.write(`✓ Accepted "${match.title}" into ${feedPath}\n`);
        return;
    }

    if (rejectTarget) {
        const match = candidates.find((c) => c.id === rejectTarget || c.url === rejectTarget);
        if (!match) {
            stdout.write(`Candidate "${rejectTarget}" not found in ${candidatesPath}.\n`);
            return;
        }
        const result = await curateCandidate({ candidate: match, action: 'reject', feed, candidates });
        candidates = result.candidates;
        await saveCandidates(candidatesPath, candidates);
        stdout.write(`✗ Rejected "${match.title}" from ${candidatesPath}\n`);
        return;
    }

    if (!stdin.isTTY) {
        stdout.write('Non-interactive environment detected. Use --list, --accept <id>, or --reject <id>.\n');
        return;
    }

    const rl = createInterface({ input: stdin, output: stdout });
    stdout.write(`\n=== DWithEase Discover Candidate Curation CLI ===\n`);
    stdout.write(`Loaded ${candidates.length} candidates from ${candidatesPath}\n\n`);

    for (const candidate of [...candidates]) {
        stdout.write(`--------------------------------------------------\n`);
        stdout.write(`Title:       ${candidate.title}\n`);
        stdout.write(`Source:      ${candidate.source?.name} (${candidate.url})\n`);
        stdout.write(`Published:   ${candidate.publishedAt}\n`);
        stdout.write(`Tags:        ${(candidate.tags || []).join(', ')}\n`);
        stdout.write(`Summary:\n${candidate.summary}\n\n`);

        const answer = (await rl.question('(a)ccept / (e)dit & accept / (r)eject / (s)kip / (q)uit: ')).trim().toLowerCase();

        if (answer === 'q') {
            stdout.write('Quitting curation.\n');
            break;
        }

        if (answer === 'a') {
            try {
                const result = await curateCandidate({ candidate, action: 'accept', feed, candidates });
                feed = result.feed;
                candidates = result.candidates;
                await writeFile(feedPath, `${JSON.stringify(feed, null, 2)}\n`);
                await saveCandidates(candidatesPath, candidates);
                stdout.write(`✓ Accepted "${candidate.title}" into ${feedPath}\n\n`);
            } catch (err) {
                stdout.write(`Error accepting item: ${err.message}\n\n`);
            }
        } else if (answer === 'e') {
            const newTitle = (await rl.question(`New Title (Enter to keep "${candidate.title}"): `)).trim();
            const newSummary = (await rl.question(`New Summary (Enter to keep): `)).trim();
            const newTagsStr = (await rl.question(`Tags comma-separated (Enter to keep "${(candidate.tags || []).join(', ')}"): `)).trim();

            const overrides = {};
            if (newTitle) overrides.title = newTitle;
            if (newSummary) overrides.summary = newSummary;
            if (newTagsStr) overrides.tags = newTagsStr.split(',').map((t) => t.trim());

            try {
                const result = await curateCandidate({ candidate, action: 'accept', overrides, feed, candidates });
                feed = result.feed;
                candidates = result.candidates;
                await writeFile(feedPath, `${JSON.stringify(feed, null, 2)}\n`);
                await saveCandidates(candidatesPath, candidates);
                stdout.write(`✓ Edited & accepted into ${feedPath}\n\n`);
            } catch (err) {
                stdout.write(`Error accepting item: ${err.message}\n\n`);
            }
        } else if (answer === 'r') {
            const result = await curateCandidate({ candidate, action: 'reject', feed, candidates });
            candidates = result.candidates;
            await saveCandidates(candidatesPath, candidates);
            stdout.write(`✗ Rejected candidate.\n\n`);
        } else {
            stdout.write(`Skipped.\n\n`);
        }
    }

    rl.close();
    stdout.write('Curation session finished.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await runCurateCli();
}
