# Discover Public Page Design

## Goal

Create the public page at `https://discover.dwithease.com/`.

The page reads the same JSON data as the extension Discover screen.

## Approved design

- Show the Discover content only. Do not copy the extension sidebar.
- Match the extension palette, type, spacing, card shape, button shape, and responsive two-column grid.
- Use Mulish for headings and Public Sans for body text.
- Link the DWithEase logo and footer to `https://dwithease.com/`.
- Use the live feed by default.
- Allow `?feed=dev` for the development corpus.
- Respect the system light or dark color setting.

## Page structure

The page has a compact brand header, the `Discover` title, and the extension intro text.

The content follows the extension order:

1. E-commerce products.
2. Web Development products.
3. Updates.

Each product card shows its image, `From ForkPoint`, name, benefit, and CTA.

Each update card shows its icon, title, body, and optional CTA.

The page shows a clear empty state when no item is active.

The page shows a clear retry state when the feed cannot load.

## Data contract

`feed-live.json` and `feed-dev.json` use this top-level shape:

```json
{
  "messages": []
}
```

Items with `"kind": "product"` use the extension product contract.

The page accepts only active products with a `discover` placement, a known category, valid UTC dates, short text fields, and an HTTPS product URL.

Items without `"kind": "product"` remain update items.

`images-live.json` and `images-dev.json` keep the existing extension image contract.

The page treats all feed strings as text. It never inserts remote HTML.

## Delivery

The repository stays static. It uses HTML, CSS, and browser JavaScript only.

GitHub Actions publishes the repository through GitHub Pages.

The repository includes `CNAME` with `discover.dwithease.com`.

## Test proof

Automated tests cover feed selection, product rules, grouping, safe text rendering, image lookup, the loading error, and the empty state.

A browser smoke test checks the live page layout at desktop and mobile widths.
