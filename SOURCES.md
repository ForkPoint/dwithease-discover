# Discover feed sources

This file records the inputs for `feed-dev.json`.

`sources.json` maps each canonical source URL to checked-in SVG icons under `assets/sources/` (`icon` and optional `iconDark`). Only SVG images are accepted. When `iconDark` is provided, the feed alternates between variants based on the theme. When only one icon is configured, the feed renders it with a high-contrast tile on dark surfaces. The page uses the local fallback icon when a feed source has no exact URL match.

## Curation rules

- Fetch public HTML, RSS, or Atom with a normal HTTP request.
- Use small regular expressions to read titles, links, dates, and summaries.
- Keep up to 5 recent commerce items from each editorial source.
- Keep links to source pages. Do not copy full article text.
- Remove duplicate URLs and duplicate item IDs.
- Sort editorial items by `publishedAt`, newest first.
- Review every item before it moves to `feed-live.json`.
- The RSS harvester skips posts older than 60 days, because the extension hides them.
- `npm run curate -- --reject <id>` records the URL in `rejected-candidates.json`. The RSS harvester skips these URLs, so rejected items do not return.

## Editorial sources

| Source | Source URL | Method | Cycle result on 2026-09-01 |
| --- | --- | --- | --- |
| Salesforce News | https://www.salesforce.com/news/topics/commerce/ | HTML | Working. The old `/stories/category/commerce/feed/` URL returned HTTP 404. `/news/topics/commerce/feed/` works, but on 2026-11-10 none of its posts passed the SFCC term filter, so the harvester does not read it. |
| Salesforce Commerce Blog | https://www.salesforce.com/blog/category/ecommerce/ | HTML or RSS | Working. The commerce RSS feed also returned HTTP 200. Apply the SFCC term filter and skip `/small-business/` posts. |
| Salesforce Developers Blog | https://developer.salesforce.com/blogs/feed | RSS | Working. Apply the SFCC term filter (B2C Commerce, Commerce Cloud, SFRA, PWA Kit, storefront, eCDN, SCAPI, OCAPI, Managed Runtime). General Salesforce posts are out of scope. |
| PWA Kit Releases | https://api.github.com/repos/SalesforceCommerceCloud/pwa-kit/releases | GitHub Releases API | Working. The Atom feed lists only the 10 newest releases, which are nightly builds, so stable releases never appeared there. The harvester reads the Releases API, skips prereleases and nightly builds, and queues stable releases from the last 60 days straight into `feed-dev.json` without review. |
| Rhino Inquisitor | https://rhino-inquisitor.com/archive/ | RSS | Daily CI harvest from `/index.xml` (`/feed/` only redirects there). Every post covers SFCC, so no term filter. |
| Agentic Storefront | https://agenticstorefront.com/categories/agentic-commerce/ | RSS | Daily CI harvest from `/rss.xml`. Apply the SFCC term filter. The "agentic storefront" brand name does not count as a match. |
| ForkPoint | https://forkpoint.com/articles/ | RSS | Daily CI harvest from `/rss.xml`, which carries real publication dates. Apply the SFCC term filter. |
| Salesforce Ben | https://www.salesforceben.com/category/commerce/ | Manual | Blocked. On 2026-11-10 every page and feed returned HTTP 403 with a JavaScript browser check, so it cannot be harvested automatically. Add posts by hand. |
| Digital Commerce 360 | https://www.digitalcommerce360.com/topic/technology/ | HTML | Working. `/topic/technology/feed/` works, but on 2026-11-10 none of its posts passed the SFCC term filter, so the harvester does not read it. |
| Salesforce IdeaExchange | https://ideas.salesforce.com/s/insights | Browser | Daily CI harvest. Select Commerce under Recently Delivered. Check the first 10 rows and append new ideas to `salesforce-ideas.json`. The job opens a review PR only when it finds new ideas. Do not add candidates to `feed-dev.json` automatically. Add each selected feed item in a separate PR. |

## Product sources

| Product | URL | Feed use |
| --- | --- | --- |
| Agentic Storefront Audit | https://audit.agenticstorefront.com/ | Promotion |
| CatalogSpark | https://catalogspark.com/ | Promotion |
| RetailPace | https://retailpace.com/ | Promotion |
| IntentFusion | https://intentfusion.com/ | Promotion |

## Current feed corpus

`feed-dev.json` contains:

- 47 editorial items.
- 4 promotion items.
- 51 items in total.

`feed-live.json` contains the curated production feed with verified editorial items and active storefront tool promotions.
