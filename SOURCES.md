# Discover feed sources

This file records the inputs for `feed-dev.json`.

`sources.json` maps each canonical source URL to a checked-in icon under `assets/sources/`. The page uses the local fallback icon when a feed source has no exact URL match.

## Curation rules

- Fetch public HTML, RSS, or Atom with a normal HTTP request.
- Use small regular expressions to read titles, links, dates, and summaries.
- Keep up to 5 recent commerce items from each editorial source.
- Keep links to source pages. Do not copy full article text.
- Remove duplicate URLs and duplicate item IDs.
- Sort editorial items by `publishedAt`, newest first.
- Review every item before it moves to `feed-live.json`.

## Editorial sources

| Source | Source URL | Method | Cycle result on 2026-09-01 |
| --- | --- | --- | --- |
| Salesforce News | https://www.salesforce.com/news/topics/commerce/ | HTML | Working. The old `/stories/category/commerce/feed/` URL returned HTTP 404. The HTML topic page is the fallback. |
| Salesforce Commerce Blog | https://www.salesforce.com/blog/category/ecommerce/ | HTML or RSS | Working. The commerce RSS feed also returned HTTP 200. |
| Salesforce Developers Blog | https://developer.salesforce.com/blogs/feed | RSS | Working. Apply an SFCC, B2C Commerce, PWA Kit, or composable storefront term filter. |
| PWA Kit Releases | https://github.com/SalesforceCommerceCloud/pwa-kit/releases.atom | Atom | Working. The current Atom window contains nightly builds. The dev feed keeps 1 nightly item for testing. Exclude nightly builds from live curation unless they add useful release detail. |
| Rhino Inquisitor | https://rhino-inquisitor.com/archive/ | HTML | Working. `/feed/` returned a small HTML page instead of a usable XML feed. Use the archive page. |
| Agentic Storefront | https://agenticstorefront.com/categories/agentic-commerce/ | HTML | Working. |
| ForkPoint | https://forkpoint.com/articles/ | HTML | Working. Article pages do not expose a reliable publication date. The dev feed uses the shared HTTP `Last-Modified` date as a temporary value. Set real dates before live use. |
| Salesforce Ben | https://www.salesforceben.com/category/commerce/ | HTML | Partial. The category page shell does not expose a full item list in the first HTML response. Use commerce search results and article pages as the fallback. |
| Digital Commerce 360 | https://www.digitalcommerce360.com/topic/technology/ | HTML | Working. Apply ecommerce, agentic commerce, storefront, search, retail, or platform term filters. |

## Product sources

| Product | URL | Feed use |
| --- | --- | --- |
| Agentic Storefront Audit | https://audit.agenticstorefront.com/ | Promotion |
| CatalogSpark | https://catalogspark.com/ | Promotion |
| RetailPace | https://retailpace.com/ | Promotion |
| IntentFusion | https://intentfusion.com/ | Promotion |

## Current dev corpus

`feed-dev.json` contains:

- 38 editorial items.
- 4 promotion items.
- 42 items in total.

`feed-live.json` remains a valid empty v2 feed during dev curation.
