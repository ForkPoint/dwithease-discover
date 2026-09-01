# Discover Feed v2 Design

## Goal

Replace the public Discover source with a typed feed for commerce news, technical articles, and owned product promotions.

The public page reads this format only.

## Acceptance

- `feed-live.json` is a valid empty v2 feed until curation is approved.
- `feed-dev.json` contains manually curated candidates and owned promotions.
- Every published file passes the TypeScript 7 and Zod 4.5 contract.
- Feed curation is manual in the current scope.
- Gather and build automation is deferred.
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

## Published files

- `feed-dev.json` contains manually reviewed development candidates and the four owned campaigns.
- `feed-live.json` remains a valid empty v2 feed until the development corpus is approved.
- `feed.schema.json` and `openapi.json` are generated from the Zod contract.

The current repository has no gather command, build command, or intermediate `content/*.json` files. Maintainers edit the public feed files directly and run the shared validator before publication.

## Sources

Manual curation reviews these 9 editorial sources:

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

Maintainers keep short descriptions only. They do not copy article bodies.

## Manual curation

Maintainers review the source pages in `SOURCES.md`. They add suitable candidates to `feed-dev.json`, remove duplicate canonical URLs and IDs, and sort editorial items by `publishedAt`.

They run `npm run validate:feed -- feed-live.json feed-dev.json` before publication. They keep `feed-live.json` empty until the development corpus is approved. Gather and build scripts remain deferred work.

## Public page

The page keeps the current DWithEase visual system.

It renders promotions under `Featured tools`. It renders articles and news under `Latest from commerce`.

Each card shows the source, date, title, summary, optional image, tags, and CTA. Remote strings use `textContent`. Links use HTTPS and open with `noopener noreferrer`.

The page no longer reads `images-live.json` or `images-dev.json`. Each v2 item owns its optional image URL.

## Explicit non-goals

- Do not publish the old message format from this repository.
- Do not auto-approve gathered candidates.
- Do not add gather or build automation in the current scope.
- Do not download or mirror remote article images.
- Do not copy full article content.
- Do not implement the shared 14-day display limit here. The extension owns that user-level state.
- Do not add source adapters or parser packages.

## Proof

Automated tests cover Zod validation, both published feed files, safe page rendering, and CLI exit codes.

The final gate runs `npm run typecheck`, `npm test`, `npm run validate:feed -- feed-live.json feed-dev.json`, `npm audit --audit-level=high`, and `git diff --check`.
