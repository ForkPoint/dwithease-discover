# Discover Public Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public Discover page that renders the extension feed with the same visual design.

**Architecture:** A small ES module validates and groups feed data. A browser entry module fetches the selected feed and image corpus, then renders safe DOM nodes into a static HTML shell. GitHub Pages serves all files without a production build.

**Tech Stack:** HTML5, CSS, browser ES modules, Node.js test runner, LinkeDOM, GitHub Pages

**Spec:** `docs/superpowers/specs/2026-09-01-discover-public-page-design.md`

## Global Constraints

- The public page has no extension sidebar.
- The live page reads `feed-live.json` by default.
- `?feed=dev` reads `feed-dev.json`.
- Remote feed strings render as text only.
- Product URLs must use HTTPS.
- The page must work without a production build step.

---

### Task 1: Feed model

**Files:**
- Create: `package.json`
- Create: `test/feed-model.test.js`
- Create: `assets/feed-model.js`

**Interfaces:**
- Consumes: Raw `{ messages: unknown[] }` JSON and optional image JSON.
- Produces: `selectFeedName(search)`, `buildCatalog(raw, now)`, and `createImageMap(raw)`.

- [ ] **Step 1: Write the failing model tests**

Add literal fixtures that prove live/dev selection, active product filtering, category grouping, legacy update retention, and image mapping.

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test`

Expected: FAIL because `assets/feed-model.js` does not exist.

- [ ] **Step 3: Implement the model**

Add strict product field checks. Return `{ ecommerce, webDevelopment, updates }`. Do not mutate the source document.

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `npm test`

Expected: all model tests pass.

### Task 2: Safe page renderer

**Files:**
- Create: `test/discover-page.test.js`
- Create: `assets/discover-page.js`
- Create: `index.html`

**Interfaces:**
- Consumes: The Task 1 model and a root DOM element.
- Produces: `renderCatalog(root, catalog, images)`, `renderError(root, retry)`, and `startDiscoverPage(options)`.

- [ ] **Step 1: Write the failing renderer tests**

Use LinkeDOM to check section order, product and update cards, literal unsafe text, HTTPS links, the empty state, and the retry action.

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test`

Expected: FAIL because `assets/discover-page.js` does not exist.

- [ ] **Step 3: Implement the safe renderer and HTML shell**

Create nodes with DOM APIs. Set remote strings through `textContent`. Fetch the selected feed and matching image corpus with `cache: "no-store"`.

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `npm test`

Expected: all model and renderer tests pass.

### Task 3: Extension-matched visual layer and feed corpus

**Files:**
- Create: `assets/discover.css`
- Create: `assets/dwithease-logo.svg`
- Create: `assets/dwithease-logo-on-dark.svg`
- Create: `assets/fonts/*.woff2`
- Create: `feed-live.json`
- Create: `feed-dev.json`
- Create: `images-live.json`
- Create: `images-dev.json`

**Interfaces:**
- Consumes: The HTML classes from Task 2 and the existing extension feed corpus.
- Produces: The final responsive light/dark page and local feed files.

- [ ] **Step 1: Copy the exact brand assets and feed corpus**

Reuse the extension logos, the four font weights, and the current live/dev message and image JSON files.

- [ ] **Step 2: Add two development-only product records**

Add one valid e-commerce product and one valid web-development product. Keep the live feed unchanged.

- [ ] **Step 3: Add the exact extension design tokens**

Use the extension colors, ambient bloom, 18 px cards, pill buttons, Mulish headings, Public Sans body text, 1,200 px content cap, and responsive two-column grid.

- [ ] **Step 4: Run the full tests**

Run: `npm test`

Expected: all tests pass.

### Task 4: GitHub Pages delivery and browser proof

**Files:**
- Create: `CNAME`
- Create: `.nojekyll`
- Create: `.github/workflows/pages.yml`

**Interfaces:**
- Consumes: The repository root as the static Pages artifact.
- Produces: A deployment to `https://discover.dwithease.com/`.

- [ ] **Step 1: Add the Pages workflow and domain files**

Configure Pages with `actions/configure-pages@v5`. Upload the site with `actions/upload-pages-artifact@v4`. Deploy it with `actions/deploy-pages@v4`.

- [ ] **Step 2: Validate files and JSON**

Run: `npm test`

Run: `jq empty feed-live.json feed-dev.json images-live.json images-dev.json`

Expected: both commands exit 0.

- [ ] **Step 3: Run a local browser smoke test**

Serve the repository root. Check the live feed, `?feed=dev`, a narrow viewport, keyboard focus, and the DWithEase links.

- [ ] **Step 4: Commit and push**

Commit the tested files to `main`. Push `main` to `origin` so GitHub Pages can deploy the site.
