# Discover Feed v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish a reviewed Discover v2 corpus with commerce articles, news, and four owned promotions.

**Architecture:** TypeScript scripts gather remote text into a review file and build public feeds from reviewed content. Zod validates every item before publication. The static page consumes the same v2 files and renders safe DOM nodes.

**Tech Stack:** Node.js 26 built-in `fetch`, TypeScript 7.0.2, Zod 4.5.4, regular expressions, Node test runner, LinkeDOM, GitHub Pages

**Spec:** `docs/superpowers/specs/2026-09-01-discover-feed-v2-design.md`

## Global Constraints

- Use TypeScript `7.0.2` and Zod `4.5.4`.
- Use built-in `fetch()` and regular expressions only for remote content.
- Do not add RSS, XML, scraping, or browser automation packages.
- Do not write a public feed until Zod validation passes.
- Do not auto-approve gathered candidates.
- Use the v2 format only in this repository.
- Render remote strings with `textContent` only.
- Keep at most 10 candidates per editorial source.

---

### Task 1: Gather and normalize editorial candidates

**Files:**
- Create: `scripts/gather.ts`
- Create: `test/gather.test.ts`
- Create: `content/candidates.json`
- Create: `SOURCES.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: Nine remote RSS, Atom, XML, or HTML URLs.
- Produces: `decodeEntities(text: string): string`, `stripHtml(text: string): string`, `parseXmlItems(text: string, source: SourceConfig): FeedItem[]`, `parseHtmlItems(text: string, source: SourceConfig): FeedItem[]`, `gatherCandidates(fetchImpl?: typeof fetch): Promise<GatherResult>`, and `content/candidates.json`.

- [ ] **Step 1: Write failing parser tests**

Use literal source fragments. Prove XML CDATA, HTML tags, entity decoding, source attribution, UTC dates, HTTPS URLs, source filters, and stable IDs.

```ts
test('parses a filtered Salesforce developer RSS item', () => {
    const items = parseXmlItems(SALESFORCE_DEVELOPER_RSS, SALESFORCE_DEVELOPERS);
    assert.deepEqual(items.map(({ id, type, title }) => ({ id, type, title })), [{
        id: 'salesforce-developers-introducing-the-b2c-commerce-cli',
        type: 'article',
        title: 'Introducing the B2C Commerce CLI',
    }]);
});

test('parses article links from the ForkPoint listing', () => {
    const items = parseHtmlItems(FORKPOINT_HTML, FORKPOINT);
    assert.equal(items[0]?.source.name, 'ForkPoint');
    assert.equal(items[0]?.url, 'https://forkpoint.com/articles/example/');
});
```

- [ ] **Step 2: Run the parser tests and verify RED**

Run: `node --test test/gather.test.ts`

Expected: FAIL because `scripts/gather.ts` does not exist.

- [ ] **Step 3: Add the fixed source registry**

Define these exact fetch URLs in `scripts/gather.ts`:

```ts
const SOURCES = [
    'https://www.salesforce.com/news/topics/commerce/feed/',
    'https://www.salesforce.com/blog/category/commerce/feed/',
    'https://developer.salesforce.com/blogs/feed',
    'https://github.com/SalesforceCommerceCloud/pwa-kit/releases.atom',
    'https://rhino-inquisitor.com/index.xml',
    'https://agenticstorefront.com/blog/',
    'https://forkpoint.com/articles/',
    'https://www.salesforceben.com/category/commerce/',
    'https://www.digitalcommerce360.com/topic/technology/',
] as const;
```

Each config must include `id`, `name`, `siteUrl`, `feedUrl`, `format`, `type`, optional keyword filters, and its source-specific link expression.

- [ ] **Step 4: Implement the text normalizers and parsers**

Use regular expressions for `<item>`, `<entry>`, `<title>`, `<link>`, `<description>`, `<summary>`, `<pubDate>`, `<updated>`, and source listing cards. Remove scripts and styles before other tags. Decode the five named HTML entities plus numeric entities.

Build each candidate with this exact field set:

```ts
{
    id,
    type,
    title,
    summary,
    url,
    source: { name, url: siteUrl },
    publishedAt,
    tags,
    ...(image ? { image: { src: image, alt: '' } } : {}),
    cta: { label: type === 'news' ? 'Read news' : 'Read article' },
}
```

- [ ] **Step 5: Add gather failure isolation tests**

Use an in-memory fetch function. Make one source return `500` and one return valid text. Assert that the valid item remains and that the error names the failed source. Make every source fail and assert that gathering rejects without writing output.

- [ ] **Step 6: Run the gather tests and verify RED**

Run: `node --test test/gather.test.ts`

Expected: FAIL because `gatherCandidates` does not yet isolate source failures.

- [ ] **Step 7: Implement gathering and safe output**

Fetch all sources with a DWithEase user agent and `Accept: text/html, application/rss+xml, application/atom+xml, application/xml`. Continue after per-source failures. Deduplicate by canonical HTTPS URL. Sort by `publishedAt` descending. Keep 10 items per source. Validate `{ version: 2, locale: 'en', updatedAt, items }` with `validateFeed` before writing `{ items }` to `content/candidates.json`.

- [ ] **Step 8: Document all sources**

Create `SOURCES.md` with 13 rows. Include display name, owner, page URL, fetch URL, format, parser/filter, and whether the source is gathered or manually maintained.

- [ ] **Step 9: Add and run the gather command**

Add:

```json
"gather": "node scripts/gather.ts"
```

Run: `npm run gather`

Expected: at least one candidate from each available editorial source and a written `content/candidates.json`.

- [ ] **Step 10: Verify Task 1**

Run: `npm run typecheck && npm test`

Expected: type-checking passes and the gather tests prove that the candidate items pass the shared Zod item contract.

- [ ] **Step 11: Commit Task 1**

```bash
git add package.json package-lock.json scripts/gather.ts test/gather.test.ts content/candidates.json SOURCES.md
git commit -m "feat: gather Discover candidates"
```

### Task 2: Build reviewed live and development feeds

**Files:**
- Create: `scripts/build-feed.ts`
- Create: `test/build-feed.test.ts`
- Create: `content/curated.json`
- Create: `content/promotions.json`
- Modify: `feed-live.json`
- Modify: `feed-dev.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: `{ items: FeedItem[] }` candidate, curated, and promotion files.
- Produces: `buildFeeds(input: BuildInput, updatedAt: string): { live: Feed; dev: Feed }` and validated `feed-live.json` and `feed-dev.json`.

- [ ] **Step 1: Write failing build tests**

```ts
test('keeps candidates out of live and gives curated URLs priority', () => {
    const { live, dev } = buildFeeds({
        candidates: [candidate, duplicateCandidate],
        curated: [curated],
        promotions: [promotion],
    }, '2026-09-01T12:00:00Z');

    assert.deepEqual(live.items.map(({ id }) => id), [promotion.id, curated.id]);
    assert.deepEqual(dev.items.map(({ id }) => id), [promotion.id, curated.id, candidate.id]);
});
```

Also prove duplicate ID removal, canonical URL removal, deterministic order, and validation failure before writing.

- [ ] **Step 2: Run the build tests and verify RED**

Run: `node --test test/build-feed.test.ts`

Expected: FAIL because `scripts/build-feed.ts` does not exist.

- [ ] **Step 3: Implement the pure builder**

Create `buildFeeds`. Put promotions first. Put editorial items in date order. Remove duplicate IDs and editorial URLs. Let curated items win over candidates. Build both feeds with version `2`, locale `en`, and the supplied UTC update time. Parse each result with `FeedSchema.parse`.

- [ ] **Step 4: Add the four promotions**

Create campaigns for:

- `https://audit.agenticstorefront.com/`
- `https://catalogspark.com/`
- `https://retailpace.com/`
- `https://intentfusion.com/`

Use accurate product claims from each owned page. Use HTTPS links. Use all three placements. Give each campaign a clear end date that can be extended during curation.

- [ ] **Step 5: Seed the curated corpus**

Review the gathered candidates. Put 1 or 2 current, relevant items from each available editorial source in `content/curated.json`. Keep the remaining items in `content/candidates.json`.

- [ ] **Step 6: Implement atomic feed writes**

Read all three content files. Build both feeds in memory. Validate both feeds. Write sibling `.tmp` files. Rename them to `feed-live.json` and `feed-dev.json` only after both writes succeed.

- [ ] **Step 7: Add and run the build command**

Add:

```json
"build:feed": "node scripts/build-feed.ts"
```

Run: `npm run build:feed`

Expected: both feed files use version `2` and pass Zod validation.

- [ ] **Step 8: Verify Task 2**

Run: `npm run typecheck && npm test && npm run validate:feed -- feed-live.json feed-dev.json`

Expected: every command exits `0`.

- [ ] **Step 9: Commit Task 2**

```bash
git add package.json scripts/build-feed.ts test/build-feed.test.ts content/curated.json content/promotions.json feed-live.json feed-dev.json
git commit -m "feat: build Discover v2 feeds"
```

### Task 3: Render the v2 feed on the public page

**Files:**
- Modify: `assets/feed-model.js`
- Modify: `assets/discover-page.js`
- Modify: `assets/discover.css`
- Modify: `test/feed-model.test.js`
- Modify: `test/discover-page.test.js`
- Modify: `index.html`
- Delete: `images-live.json`
- Delete: `images-dev.json`

**Interfaces:**
- Consumes: A validated-looking v2 feed in browser JavaScript.
- Produces: `buildCatalog(raw, now)` returning `{ promotions, editorial }` and a safe sectioned page.

- [ ] **Step 1: Replace model tests with the v2 contract**

Prove that the model accepts known types, HTTPS URLs, required text, active campaign dates, and `discover` placement. Prove that it rejects malformed records without breaking the remaining catalog.

- [ ] **Step 2: Run model tests and verify RED**

Run: `node --test test/feed-model.test.js`

Expected: FAIL because the model still reads `messages`.

- [ ] **Step 3: Implement the v2 browser model**

Read `raw.items`. Return active Discover promotions and date-sorted editorial items. Keep browser checks small because the build pipeline owns full Zod validation.

- [ ] **Step 4: Replace renderer tests with v2 card tests**

Assert the `Featured tools` and `Latest from commerce` order. Assert source, date, summary, tags, CTA, safe literal text, optional image fallback, empty state, and retry state.

- [ ] **Step 5: Run renderer tests and verify RED**

Run: `node --test test/discover-page.test.js`

Expected: FAIL because the renderer still expects products and legacy updates.

- [ ] **Step 6: Implement v2 cards**

Render promotions with a `Featured` eyebrow. Render editorial items with their source and date. Set remote copy with `textContent`. Use only validated HTTPS links. Set image `alt` from the feed and keep the local fallback.

- [ ] **Step 7: Remove the image corpus request**

Fetch only `feed-live.json` or `feed-dev.json`. Remove `createImageMap`, `images-live.json`, and `images-dev.json` use. Update the loading and empty copy for articles and tools.

- [ ] **Step 8: Polish the existing design for the new cards**

Reuse current colors, fonts, spacing, card radius, focus states, and light/dark rules. Add compact source/date metadata and tag pills. Keep two columns on wide screens and one column on narrow screens.

- [ ] **Step 9: Verify Task 3**

Run: `npm test`

Serve the repository and check `/` plus `/?feed=dev` at 1,280 px and 390 px widths. Confirm no browser console errors and no failed network requests.

- [ ] **Step 10: Commit Task 3**

```bash
git add assets index.html test feed-live.json feed-dev.json
git rm images-live.json images-dev.json
git commit -m "feat: render Discover v2 content"
```

### Task 4: Publish the schema, content, and feed workflow

**Files:**
- Modify: `.github/workflows/pages.yml`
- Modify: `SOURCES.md`

**Interfaces:**
- Consumes: The static page, built feeds, schema, and source documentation.
- Produces: A GitHub Pages artifact that includes all public feed files.

- [ ] **Step 1: Update Pages verification**

Run these workflow commands before artifact creation:

```yaml
- name: Type-check feed tools
  run: npm run typecheck

- name: Validate public feeds
  run: npm run validate:feed -- feed-live.json feed-dev.json
```

- [ ] **Step 2: Update the Pages artifact file list**

Copy `feed.schema.json` with `index.html`, `CNAME`, `.nojekyll`, `feed-live.json`, and `feed-dev.json`. Stop copying the removed image corpus files.

- [ ] **Step 3: Add operator commands**

Document this exact curation flow:

```bash
npm run gather
# Review content/candidates.json and move approved items to content/curated.json.
npm run build:feed
npm run validate:feed -- feed-live.json feed-dev.json
```

- [ ] **Step 4: Run the final gate**

Run:

```bash
npm run write:schema
npm run typecheck
npm test
npm run build:feed
npm run validate:feed -- feed-live.json feed-dev.json
npm audit --audit-level=high
git diff --check
```

Expected: all commands exit `0`, all tests pass, and npm reports `0` high-severity vulnerabilities.

- [ ] **Step 5: Commit Task 4**

```bash
git add .github/workflows/pages.yml SOURCES.md feed.schema.json package.json package-lock.json
git commit -m "docs: add Discover feed workflow"
```
