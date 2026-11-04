# DWithEase Discover

DWithEase Discover is the DWithEase news engine for ecommerce and Salesforce B2C Commerce (SFCC) updates. It brings commerce news, technical articles, release notes, and useful tools into one light public page.

## Public links

- [Discover](https://discover.dwithease.com/)
- [Live feed](https://discover.dwithease.com/feed-live.json)
- [Development feed](https://discover.dwithease.com/feed-dev.json)
- [RSS 2.0 feed](https://discover.dwithease.com/rss.xml)
- [Atom 1.0 feed](https://discover.dwithease.com/atom.xml)
- [Interactive API reference](https://discover.dwithease.com/schema.html)
- [JSON Schema](https://discover.dwithease.com/feed.schema.json)
- [OpenAPI document](https://discover.dwithease.com/openapi.json)
- [Source registry](https://discover.dwithease.com/sources.json)
- [DWithEase](https://dwithease.com/)

## Editorial sources

See [SOURCES.md](SOURCES.md) for the full source list and curation rules.

## Feed format

Both public endpoints use the current JSON format:

```json
{
  "locale": "en",
  "updatedAt": "2026-09-01T12:00:00Z",
  "items": []
}
```

Each item has a stable slug ID, a type, an HTTPS URL, source details, a publication date, tags, and a CTA. Editorial items use `article` or `news`. Promotions also include a dated campaign and one or more placements.

`source.icon` is an optional HTTPS URL for the source logo. Curation and promotion add
this URL from `sources.json`, so consumers can render icons from the feed alone. Older
feeds without this field remain valid. Unknown sources use the publisher's fallback SVG.

The development feed contains the curation corpus. The live feed remains empty until that corpus is approved. Validate both files before publication:

```sh
npm run validate:feed -- feed-live.json feed-dev.json
```

### Publishing schedule

`feed-dev.json` acts as the publish queue. Every weekday at 08:00 UTC, the `Publish queued feed items` workflow moves the oldest unpublished editorial items to `feed-live.json`, regenerates `rss.xml` and `atom.xml`, commits to `main`, and deploys the site. This keeps extension users from receiving a large batch at once.

If the push fails because `main` moved, the job rebuilds the batch from the newest `main` and tries again, up to 3 times. When any scheduled job (harvest, publish, or deploy) fails, it opens an `Automation failed: <workflow>` issue, or comments on the open one.

The harvest jobs rebuild their bot branch from `main` on every run and carry over candidates from an unmerged PR. A source that returns an error or no entries fails the run after the PR is updated.

The workflow publishes 2 items per run. Set the `FEED_PUBLISH_LIMIT` repository variable to change this. To publish one batch locally:

```sh
npm run promote:feed -- --limit 2
```

## UX authoring guidance

Use the preferred length when possible. The raw maximum counts the original JSON string before trimming.

| Field | Preferred length | Raw maximum |
| --- | ---: | ---: |
| Title | 70 characters | 120 characters |
| Summary | 150 characters | 280 characters |
| CTA label | 24 characters | 32 characters |
| Image alt text | 100 characters | 160 characters |

The page does not clamp text. Write complete copy that fits within these limits.
