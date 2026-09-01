# Discover Public Page Design

## Status

This design is superseded by [Discover Feed v2 Design](2026-09-01-discover-feed-v2-design.md).

The approved public page uses a light-only DWithEase design and reads the v2 feed contract. It renders promotions under `Featured tools` and editorial items under `Latest from commerce`.

`feed-live.json` is the default endpoint. `?feed=dev` selects `feed-dev.json`. Each endpoint uses `{ "version": 2, "locale": "en", "updatedAt": "...", "items": [] }`.

Each v2 item owns its optional image URL. The page does not request a separate image corpus.
