import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const INSIGHTS_URL = 'https://ideas.salesforce.com/s/insights';

export function makeCandidate(row) {
    const candidate = {
        id: row.ideaId,
        title: row.ideaName,
        availability: row.availability,
        points: row.points,
        ideaUrl: `https://ideas.salesforce.com/s/idea/${row.ideaId}`,
    };
    if (row.releaseNotesUrl?.startsWith('https://')) candidate.releaseNotesUrl = row.releaseNotesUrl;
    return candidate;
}

export function mergeCandidates(catalog, rows, harvestedAt) {
    const knownIds = new Set(catalog.ideas.map(({ id }) => id.toLowerCase()));
    const additions = rows
        .map(makeCandidate)
        .filter(({ id }) => {
            const normalizedId = id.toLowerCase();
            if (knownIds.has(normalizedId)) return false;
            knownIds.add(normalizedId);
            return true;
        });
    if (!additions.length) return { catalog, additions };
    return {
        additions,
        catalog: { ...catalog, harvestedAt, ideas: [...additions, ...catalog.ideas] },
    };
}

async function harvestCommerceIdeas() {
    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    let commerceRows;
    let captureCommerceRows = false;

    page.on('response', async (response) => {
        if (!captureCommerceRows || !response.url().includes('/s/sfsites/aura?')) return;
        try {
            const payload = await response.json();
            const values = payload.actions
                ?.flatMap((action) => action.returnValue?.returnValue ?? [])
                .filter((row) => row.cloud === 'Commerce' && row.ideaId && row.ideaName);
            if (values?.length) commerceRows = values;
        } catch {
            // Other Aura calls can return text or an empty body.
        }
    });

    try {
        await page.goto(INSIGHTS_URL, { waitUntil: 'networkidle', timeout: 60_000 });
        const acceptCookies = page.getByRole('button', { name: 'ACCEPT ALL COOKIES' }).first();
        if (await acceptCookies.isVisible()) {
            await acceptCookies.click();
            await page.locator('#onetrust-consent-sdk').waitFor({ state: 'hidden', timeout: 10_000 });
        }
        await page.getByRole('combobox').click();
        const commerceOption = page.locator('[role="option"][aria-label^="Commerce,"]');
        await commerceOption.waitFor({ state: 'visible', timeout: 10_000 });
        commerceRows = undefined;
        captureCommerceRows = true;
        await commerceOption.click();
        for (let attempt = 0; attempt < 30 && !commerceRows?.length; attempt += 1) {
            await page.waitForTimeout(1_000);
        }
        if (!commerceRows?.length) throw new Error('Salesforce returned no Commerce ideas');
        return commerceRows.slice(0, 10);
    } finally {
        await browser.close();
    }
}

async function main() {
    const catalogPath = process.argv[2] ?? 'salesforce-ideas.json';
    const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
    const rows = await harvestCommerceIdeas();
    const result = mergeCandidates(catalog, rows, new Date().toISOString());
    if (!result.additions.length) {
        console.log('Salesforce IdeaExchange: no new Commerce ideas');
        return;
    }
    await writeFile(catalogPath, `${JSON.stringify(result.catalog, null, 2)}\n`);
    console.log(`Salesforce IdeaExchange: added ${result.additions.length} Commerce candidates`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
