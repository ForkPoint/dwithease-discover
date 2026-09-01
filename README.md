# DWithEase Discover

DWithEase Discover is the DWithEase news engine for ecommerce and Salesforce B2C Commerce (SFCC) updates. It brings commerce news, technical articles, release notes, and useful tools into one light public page.

## Public links

- [Discover](https://discover.dwithease.com/)
- [Live v2 feed](https://discover.dwithease.com/feed-live.json)
- [Development v2 feed](https://discover.dwithease.com/feed-dev.json)
- [Interactive API reference](https://discover.dwithease.com/schema.html)
- [JSON Schema](https://discover.dwithease.com/feed.schema.json)
- [OpenAPI document](https://discover.dwithease.com/openapi.json)
- [Source registry](https://discover.dwithease.com/sources.json)
- [DWithEase](https://dwithease.com/)

## Editorial sources

See [SOURCES.md](SOURCES.md) for the full source list and curation rules.

## Feed v2

Both public endpoints use the v2 JSON format:

```json
{
  "version": 2,
  "locale": "en",
  "updatedAt": "2026-09-01T12:00:00Z",
  "items": []
}
```

Each item has a stable slug ID, a type, an HTTPS URL, source details, a publication date, tags, and a CTA. Editorial items use `article` or `news`. Promotions also include a dated campaign and one or more placements.

The development feed contains the curation corpus. The live feed remains empty until that corpus is approved. Validate both files before publication:

```sh
npm run validate:feed -- feed-live.json feed-dev.json
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
