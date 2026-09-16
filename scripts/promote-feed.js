import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { FeedSchema } from './feed-schema.ts';
import { generateAtom, generateRss } from './write-syndication.ts';

export function getPromotableItems(devFeed, liveFeed) {
    const liveUrls = new Set(liveFeed.items.map((i) => i.url));
    const liveIds = new Set(liveFeed.items.map((i) => i.id));

    return devFeed.items.filter((item) => {
        // We only promote editorial items; promotions are managed separately
        if (item.type === 'promotion') return false;
        return !liveUrls.has(item.url) && !liveIds.has(item.id);
    });
}

export function mergeAndSortFeed(liveFeed, newItems, timestamp = new Date().toISOString()) {
    const promotions = liveFeed.items.filter((i) => i.type === 'promotion');
    const existingEditorial = liveFeed.items.filter((i) => i.type !== 'promotion');

    const liveUrls = new Set(liveFeed.items.map((i) => i.url));
    const liveIds = new Set(liveFeed.items.map((i) => i.id));

    const additions = [];
    for (const item of newItems) {
        if (!liveUrls.has(item.url) && !liveIds.has(item.id)) {
            liveUrls.add(item.url);
            liveIds.add(item.id);
            additions.push(item);
        }
    }

    const combinedEditorial = [...existingEditorial, ...additions];
    combinedEditorial.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    const updatedFeed = {
        ...liveFeed,
        updatedAt: timestamp,
        items: [...promotions, ...combinedEditorial],
    };

    // Validate using Zod schema
    FeedSchema.parse(updatedFeed);
    return {
        feed: updatedFeed,
        addedCount: additions.length,
        additions,
    };
}

export async function runPromoteCli(args = process.argv.slice(2), { stdout = process.stdout } = {}) {
    let fromPath = 'feed-dev.json';
    let toPath = 'feed-live.json';
    let rssPath = 'rss.xml';
    let atomPath = 'atom.xml';
    let itemId = null;
    let dryRun = false;
    let listOnly = false;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--from' && args[i + 1]) fromPath = args[++i];
        else if (args[i] === '--to' && args[i + 1]) toPath = args[++i];
        else if (args[i] === '--item' && args[i + 1]) itemId = args[++i];
        else if (args[i] === '--dry-run') dryRun = true;
        else if (args[i] === '--list') listOnly = true;
    }

    const devFeed = JSON.parse(await readFile(fromPath, 'utf8'));
    const liveFeed = JSON.parse(await readFile(toPath, 'utf8'));

    const promotable = getPromotableItems(devFeed, liveFeed);

    if (listOnly) {
        stdout.write(`Found ${promotable.length} promotable editorial item(s) in ${fromPath}:\n\n`);
        promotable.forEach((item, idx) => {
            stdout.write(`[${idx + 1}] ${item.title}\n`);
            stdout.write(`    ID:        ${item.id}\n`);
            stdout.write(`    Published: ${item.publishedAt}\n`);
            stdout.write(`    Source:    ${item.source?.name} (${item.url})\n\n`);
        });
        return;
    }

    let itemsToPromote = promotable;
    if (itemId) {
        itemsToPromote = promotable.filter((i) => i.id === itemId || i.url === itemId);
        if (itemsToPromote.length === 0) {
            stdout.write(`No promotable item found with ID or URL "${itemId}".\n`);
            return;
        }
    }

    if (itemsToPromote.length === 0) {
        stdout.write(`No new items to promote from ${fromPath} to ${toPath}.\n`);
        return;
    }

    stdout.write(`Promoting ${itemsToPromote.length} item(s) from ${fromPath} to ${toPath}...\n`);
    itemsToPromote.forEach((item) => {
        stdout.write(`  + [${item.id}] ${item.title}\n`);
    });

    if (dryRun) {
        stdout.write('\n[Dry run] No files modified.\n');
        return;
    }

    const { feed: updatedFeed, addedCount } = mergeAndSortFeed(liveFeed, itemsToPromote);

    await writeFile(toPath, `${JSON.stringify(updatedFeed, null, 2)}\n`);

    // Synchronize RSS and Atom feeds
    const rssContent = generateRss(updatedFeed);
    const atomContent = generateAtom(updatedFeed);
    await writeFile(rssPath, rssContent);
    await writeFile(atomPath, atomContent);

    stdout.write(`\n✓ Successfully promoted ${addedCount} item(s) to ${toPath}.\n`);
    stdout.write(`✓ Synchronized ${rssPath} and ${atomPath}.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await runPromoteCli();
}
