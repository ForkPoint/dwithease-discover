# Discover Feed v2 Design

## Goal

Replace the public Discover source with a typed feed for commerce news, technical articles, and owned product promotions.

The public page and future extension work will read this new format only. The old feed remains hosted elsewhere.

## Acceptance

- `feed-live.json` contains approved editorial items and owned promotions.
- `feed-dev.json` also contains unapproved gather candidates.
- Every published file passes the TypeScript 7 and Zod 4.5 contract.
- One manual command gathers the current source pages with built-in `fetch()` and regular expressions.
- Gathering never changes the live feed.
- The public page renders the v2 feed without inserting remote HTML.
- `SOURCES.md` records every source URL, fetch method, filter, and owner.

## Feed contract

The top-level shape is:

```json
{
  "version": 2,
  "locale": "en",
  "updatedAt": "2026-09-01T12:00:00Z",
  "items": []
}
```

Each item has a stable slug ID, one type, short text, one HTTPS canonical URL, source attribution, a publication date, tags, an optional image, and one CTA.

Editorial types are `article` and `news`.

The `promotion` type also requires a campaign ID, start date, end date, and one or more placements from `discover`, `task-end`, and `popup`.

The Zod contract adds rules that JSON Schema cannot fully express. It rejects duplicate item IDs and campaign end dates that do not follow their start dates.

## Content files

- `content/candidates.json` contains gathered items for review.
- `content/curated.json` contains approved editorial items.
- `content/promotions.json` contains the four owned campaigns.
- `feed-live.json` is built from curated items and promotions.
- `feed-dev.json` is built from candidates, curated items, and promotions.
- `feed.schema.json` is generated from the Zod contract.

All three `content/*.json` files use `{ "items": [] }`. The build command adds the feed version, locale, and update time.

The builder removes duplicate canonical URLs and duplicate IDs. Curated items win over candidates. Promotions remain separate from editorial URL deduplication.

## Sources

The gather command reads these 9 editorial sources:

1. Salesforce Commerce News RSS.
2. Salesforce Commerce Blog RSS.
3. Salesforce Developers Blog RSS, filtered for Commerce terms.
4. Salesforce PWA Kit GitHub release Atom feed.
5. Rhino Inquisitor XML feed.
6. Agentic Storefront blog HTML.
7. ForkPoint articles HTML.
8. SalesforceBen Commerce HTML.
9. Digital Commerce 360 technology HTML, filtered for commerce AI and storefront terms.

The promotion file records these 4 owned sources:

1. Agentic Storefront Audit.
2. CatalogSpark.
3. RetailPace.
4. IntentFusion.

Each source parser uses source-specific regular expressions. The implementation does not add an RSS package, an XML package, a scraping package, or browser automation.

The gather command keeps short descriptions only. It does not copy article bodies.

## Gather behavior

`npm run gather` fetches every editorial source.

Each source can fail without blocking the other sources. The command reports each failure. It exits with an error when every source fails.

The command normalizes HTML entities, removes tags, converts dates to UTC ISO strings, derives stable IDs from canonical URLs, applies source keyword filters, and sorts newest items first.

It writes `content/candidates.json` only after at least one source succeeds. It keeps at most 10 items per source.

## Build behavior

`npm run build:feed` reads the three content files.

It validates each result with `FeedSchema` before it writes either public feed. A failed validation leaves the existing public feed unchanged.

The live feed includes curated editorial items and active or scheduled promotions. The development feed also includes candidates.

## Public page

The page keeps the current DWithEase visual system.

It renders promotions under `Featured tools`. It renders articles and news under `Latest from commerce`.

Each card shows the source, date, title, summary, optional image, tags, and CTA. Remote strings use `textContent`. Links use HTTPS and open with `noopener noreferrer`.

The page no longer reads `images-live.json` or `images-dev.json`. Each v2 item owns its optional image URL.

## Explicit non-goals

- Do not publish the old message format from this repository.
- Do not auto-approve gathered candidates.
- Do not schedule the gather command yet.
- Do not download or mirror remote article images.
- Do not copy full article content.
- Do not implement the shared 14-day display limit here. The extension owns that user-level state.
- Do not add source adapters or parser packages.

## Proof

Automated tests cover each regex parser with local text fixtures, gather failure isolation, canonical deduplication, feed building, Zod validation, safe page rendering, and CLI exit codes.

The final gate runs `npm run typecheck`, `npm test`, `npm run build:feed`, `npm run validate:feed -- feed-live.json feed-dev.json`, `npm audit --audit-level=high`, and `git diff --check`.
