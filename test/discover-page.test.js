import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

import {
    estimateReadingTime,
    generateMarkdownReadingList,
    generateOpml,
    getReadArticles,
    markArticleRead,
    renderCatalog,
    renderError,
    setupKeyboardNavigation,
    showToast,
    startDiscoverPage,
    toggleShortcutsModal,
    toggleSubscribeModal,
} from '../assets/discover-page.js';

function createRoot() {
    const { document } = parseHTML(`
        <base href="https://discover.example/">
        <main id="discover-content"></main>
    `);
    return document.getElementById('discover-content');
}

const PROMOTION = {
    id: 'catalogspark-2026',
    type: 'promotion',
    title: 'Make product data ready',
    summary: 'Prepare product data for every commerce channel.',
    url: 'https://catalogspark.com/',
    source: {
        name: 'CatalogSpark',
        url: 'https://catalogspark.com/',
    },
    publishedAt: '2026-09-01T00:00:00Z',
    tags: ['product-data'],
    cta: {
        label: 'Explore CatalogSpark',
    },
    campaign: {
        id: 'catalogspark-2026',
        startsAt: '2026-09-01T00:00:00Z',
        endsAt: '2026-10-01T00:00:00Z',
        placements: ['discover'],
    },
};

test('renders promotions and editorial items with useful metadata', () => {
    const root = createRoot();
    const unsafeTitle = '<img src=x onerror=alert(1)>';
    const article = {
        id: 'commerce-news',
        type: 'article',
        title: unsafeTitle,
        summary: 'A useful commerce update.',
        url: 'https://example.com/article',
        source: {
            name: 'Commerce Source',
            url: 'https://example.com/',
        },
        publishedAt: '2026-08-30T00:00:00Z',
        tags: ['sfcc', 'commerce'],
        cta: {
            label: 'Read article',
        },
    };

    const sources = new Map([[
        'https://example.com/',
        { icon: 'https://discover.example/assets/sources/example.svg' },
    ]]);
    renderCatalog(root, {
        promotions: [PROMOTION],
        editorial: [article],
    }, sources);

    assert.deepEqual(
        [...root.querySelectorAll('[data-section-title]')].map((node) => node.textContent),
        ['Featured tools', 'Latest from commerce'],
    );
    assert.equal(root.querySelector('[data-item-id="commerce-news"] h3').textContent, unsafeTitle);
    assert.equal(root.querySelector('[data-item-id="commerce-news"] h3 img'), null);
    assert.match(root.querySelector('[data-item-id="commerce-news"]').textContent, /Commerce Source/);
    assert.match(root.querySelector('[data-item-id="commerce-news"]').textContent, /Aug 30, 2026/);
    assert.equal(
        root.querySelector('[data-item-id="commerce-news"] .source-icon').getAttribute('src'),
        'https://discover.example/assets/sources/example.svg',
    );
    assert.equal(
        root.querySelector('[data-item-id="catalogspark-2026"] .source-icon').getAttribute('src'),
        'assets/sources/source-fallback.svg',
    );
    assert.equal(
        root.querySelector('[data-item-id="commerce-news"] .source-icon').getAttribute('width'),
        '28',
    );
    assert.deepEqual(
        [...root.querySelectorAll('[data-item-id="commerce-news"] .tag')].map((node) => node.textContent),
        ['sfcc', 'commerce'],
    );
    assert.equal(
        root.querySelector('[data-item-id="catalogspark-2026"] a').getAttribute('href'),
        'https://catalogspark.com/',
    );
});

test('renders the Discover empty state', () => {
    const root = createRoot();

    renderCatalog(root, { promotions: [], editorial: [] });

    assert.match(root.textContent, /There are no articles or tools to discover right now/);
    assert.equal(root.querySelector('[data-testid="discover-empty"]').getAttribute('role'), 'status');
});

test('does not render actions for raw non-RFC URLs', () => {
    const root = createRoot();

    for (const url of [
        'https://catalogspark.com/\t',
        'https://catalogspark.com\\audit',
        'https://user@catalogspark.com/audit',
        'https://a@b@catalogspark.com/audit',
        'https://catalogspark.com:65536/audit',
    ]) {
        renderCatalog(root, {
            promotions: [{ ...PROMOTION, url }],
            editorial: [],
        });

        assert.equal(root.querySelector('[data-item-id="catalogspark-2026"] a'), null);
    }
});

test('renders a working retry action after a feed error', () => {
    const root = createRoot();
    let retries = 0;

    renderError(root, () => { retries += 1; });
    root.querySelector('button').click();

    assert.match(root.textContent, /Discover could not load/);
    assert.equal(root.querySelector('.error-state').getAttribute('role'), 'alert');
    assert.equal(retries, 1);
});

test('loads only the selected feed', async () => {
    const root = createRoot();
    const requests = [];
    const fetchImpl = async (url) => {
        requests.push(url);
        if (url === 'sources.json') {
            return {
                ok: true,
                url: 'https://discover.example/sources.json',
                json: async () => ({
                    sources: [{
                        name: 'CatalogSpark',
                        url: 'https://catalogspark.com/',
                        icon: 'assets/sources/catalogspark.ico',
                    }],
                }),
            };
        }
        return {
            ok: true,
            json: async () => ({
                locale: 'en',
                updatedAt: '2026-09-01T00:00:00Z',
                items: [PROMOTION],
            }),
        };
    };

    await startDiscoverPage({
        root,
        search: '?feed=dev',
        fetchImpl,
        now: Date.parse('2026-09-10T12:00:00Z'),
        pageUrl: 'https://discover.example/',
    });
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(requests, ['feed-dev.json', 'sources.json']);
    assert.ok(root.querySelector('[data-item-id="catalogspark-2026"]'));
    assert.equal(
        root.querySelector('[data-item-id="catalogspark-2026"] .source-icon').getAttribute('src'),
        'https://discover.example/assets/sources/catalogspark.ico',
    );
    assert.equal(
        root.querySelector('[data-item-id="catalogspark-2026"] .source-icon').dataset.hasDualIcon,
        undefined,
    );
});

test('renders dual icon picture elements when iconDark is configured', async () => {
    const root = createRoot();
    const fetchImpl = async (url) => {
        if (url === 'sources.json') {
            return {
                ok: true,
                json: async () => ({
                    sources: [{
                        name: 'Example',
                        url: 'https://example.com/article/',
                        icon: 'assets/sources/example.svg',
                        iconDark: 'assets/sources/example-dark.svg',
                    }],
                }),
            };
        }
        return {
            ok: true,
            json: async () => ({
                locale: 'en',
                updatedAt: '2026-09-01T00:00:00Z',
                items: [{
                    id: 'example-item',
                    type: 'article',
                    title: 'Example Title',
                    url: 'https://example.com/article/1',
                    summary: 'Example summary text',
                    source: {
                        name: 'Example',
                        url: 'https://example.com/article/',
                    },
                    tags: ['example'],
                    cta: { label: 'Read more' },
                    publishedAt: '2026-09-01T00:00:00Z',
                }],
            }),
        };
    };

    await startDiscoverPage({
        root,
        fetchImpl,
        now: Date.parse('2026-09-10T12:00:00Z'),
        pageUrl: 'https://discover.example/',
    });
    await new Promise((resolve) => setImmediate(resolve));

    const icon = root.querySelector('.source-icon');
    assert.equal(icon.getAttribute('src'), 'https://discover.example/assets/sources/example.svg');
    assert.equal(icon.dataset.hasDualIcon, 'true');

    const darkSource = icon.parentElement.querySelector('source[media*="prefers-color-scheme: dark"]');
    assert.ok(darkSource);
    assert.equal(darkSource.getAttribute('srcset'), 'https://discover.example/assets/sources/example-dark.svg');
});

test('keeps feed text when the source registry fails', async () => {
    const root = createRoot();
    const fetchImpl = async (url) => {
        if (url === 'sources.json') throw new Error('Source registry unavailable');
        return {
            ok: true,
            json: async () => ({
                locale: 'en',
                updatedAt: '2026-09-01T00:00:00Z',
                items: [PROMOTION],
            }),
        };
    };

    await startDiscoverPage({
        root,
        fetchImpl,
        now: Date.parse('2026-09-10T12:00:00Z'),
        pageUrl: 'https://discover.example/',
    });

    assert.match(root.textContent, /Make product data ready/);
    assert.equal(
        root.querySelector('.source-icon').getAttribute('src'),
        'assets/sources/source-fallback.svg',
    );
});

test('renders card titles as links and renders topic filters for multi-item editorial feeds', () => {
    const root = createRoot();
    const articles = [
        {
            id: 'sfcc-guide',
            type: 'article',
            title: 'SFCC Developer Guide',
            summary: 'A deep dive into SFCC.',
            url: 'https://example.com/sfcc-guide',
            source: { name: 'Source', url: 'https://example.com/' },
            publishedAt: '2026-09-02T00:00:00Z',
            tags: ['sfcc', 'developer-tools'],
            cta: { label: 'Read guide' },
        },
        {
            id: 'pwa-guide',
            type: 'article',
            title: 'PWA Kit Architecture',
            summary: 'Headless storefront overview.',
            url: 'https://example.com/pwa-guide',
            source: { name: 'Source', url: 'https://example.com/' },
            publishedAt: '2026-09-01T00:00:00Z',
            tags: ['pwa-kit'],
            cta: { label: 'Explore architecture' },
        },
    ];

    renderCatalog(root, { promotions: [PROMOTION], editorial: articles });

    const titleLink = root.querySelector('[data-item-id="sfcc-guide"] .card-title a');
    assert.ok(titleLink);
    assert.equal(titleLink.getAttribute('href'), 'https://example.com/sfcc-guide');
    assert.equal(titleLink.getAttribute('target'), '_blank');
    assert.equal(titleLink.textContent, 'SFCC Developer Guide');

    // Promotion card eyebrow
    assert.equal(root.querySelector('[data-item-id="catalogspark-2026"] .eyebrow-featured').textContent, 'Featured Tool');

    // Filter bar
    const filterBar = root.querySelector('.filter-bar');
    assert.ok(filterBar);
    const pills = [...filterBar.querySelectorAll('.filter-pill')];
    assert.ok(pills.some((p) => p.dataset.filter === 'sfcc'));
    assert.ok(pills.some((p) => p.dataset.filter === 'pwa-kit'));

    // Filter by PWA Kit
    const pwaPill = pills.find((p) => p.dataset.filter === 'pwa-kit');
    pwaPill.click();

    assert.equal(root.querySelector('[data-item-id="sfcc-guide"]').hidden, true);
    assert.equal(root.querySelector('[data-item-id="pwa-guide"]').hidden, false);

    // Clicking SFCC tag on a card triggers SFCC filter
    const sfccTag = root.querySelector('[data-item-id="sfcc-guide"] [data-tag="sfcc"]');
    sfccTag.click();

    assert.equal(root.querySelector('[data-item-id="sfcc-guide"]').hidden, false);
    assert.equal(root.querySelector('[data-item-id="pwa-guide"]').hidden, true);

    // Share button
    const shareBtn = root.querySelector('[data-item-id="sfcc-guide"] .card-share-btn');
    assert.ok(shareBtn);
    assert.equal(shareBtn.getAttribute('aria-label'), 'Copy link to this card');
});

test('filters articles by search input query and clears search', () => {
    const root = createRoot();
    const articles = [
        {
            id: 'sfcc-guide',
            type: 'article',
            title: 'SFCC Developer Guide',
            summary: 'A deep dive into Commerce Cloud.',
            url: 'https://example.com/sfcc-guide',
            source: { name: 'ForkPoint', url: 'https://forkpoint.com/' },
            publishedAt: '2026-09-02T00:00:00Z',
            tags: ['sfcc'],
            cta: { label: 'Read guide' },
        },
        {
            id: 'pwa-guide',
            type: 'article',
            title: 'PWA Kit Architecture',
            summary: 'Headless storefront overview.',
            url: 'https://example.com/pwa-guide',
            source: { name: 'Salesforce', url: 'https://salesforce.com/' },
            publishedAt: '2026-09-01T00:00:00Z',
            tags: ['pwa-kit'],
            cta: { label: 'Explore architecture' },
        },
    ];

    renderCatalog(root, { promotions: [], editorial: articles });

    const searchInput = root.querySelector('.feed-search-input');
    const clearBtn = root.querySelector('.search-clear-btn');
    assert.ok(searchInput);
    assert.ok(clearBtn);

    // Search for "headless" (only in pwa-guide summary)
    searchInput.value = 'headless';
    searchInput.dispatchEvent(new root.ownerDocument.defaultView.Event('input'));

    assert.equal(root.querySelector('[data-item-id="sfcc-guide"]').hidden, true);
    assert.equal(root.querySelector('[data-item-id="pwa-guide"]').hidden, false);
    assert.equal(clearBtn.hidden, false);

    // Clear search
    clearBtn.click();
    assert.equal(searchInput.value, '');
    assert.equal(root.querySelector('[data-item-id="sfcc-guide"]').hidden, false);
    assert.equal(root.querySelector('[data-item-id="pwa-guide"]').hidden, false);
    assert.equal(clearBtn.hidden, true);
});

test('toggles bookmarks, updates Saved pill, and filters saved items', () => {
    const root = createRoot();
    const articles = [
        {
            id: 'sfcc-guide',
            type: 'article',
            title: 'SFCC Developer Guide',
            summary: 'A deep dive into SFCC.',
            url: 'https://example.com/sfcc-guide',
            source: { name: 'Source', url: 'https://example.com/' },
            publishedAt: '2026-09-02T00:00:00Z',
            tags: ['sfcc'],
            cta: { label: 'Read guide' },
        },
        {
            id: 'pwa-guide',
            type: 'article',
            title: 'PWA Kit Architecture',
            summary: 'Headless storefront overview.',
            url: 'https://example.com/pwa-guide',
            source: { name: 'Source', url: 'https://example.com/' },
            publishedAt: '2026-09-01T00:00:00Z',
            tags: ['pwa-kit'],
            cta: { label: 'Explore architecture' },
        },
    ];

    renderCatalog(root, { promotions: [], editorial: articles });

    const bookmarkBtn = root.querySelector('[data-item-id="sfcc-guide"] .card-bookmark-btn');
    assert.ok(bookmarkBtn);

    // Click bookmark button to bookmark sfcc-guide
    bookmarkBtn.click();
    assert.ok(bookmarkBtn.classList.contains('is-bookmarked'));

    // Verify Saved pill appears
    const filterBar = root.querySelector('.filter-bar');
    const savedPill = filterBar.querySelector('[data-filter="saved"]');
    assert.ok(savedPill);
    assert.match(savedPill.textContent, /Saved \(1\)/);

    // Filter by Saved
    savedPill.click();
    assert.equal(root.querySelector('[data-item-id="sfcc-guide"]').hidden, false);
    assert.equal(root.querySelector('[data-item-id="pwa-guide"]').hidden, true);

    // Unbookmark
    bookmarkBtn.click();
    assert.ok(!bookmarkBtn.classList.contains('is-bookmarked'));
});

test('toggles view density between Grid and List view', () => {
    const root = createRoot();
    const articles = [
        {
            id: 'sfcc-guide',
            type: 'article',
            title: 'SFCC Developer Guide',
            summary: 'A deep dive into SFCC.',
            url: 'https://example.com/sfcc-guide',
            source: { name: 'Source', url: 'https://example.com/' },
            publishedAt: '2026-09-02T00:00:00Z',
            tags: ['sfcc'],
            cta: { label: 'Read guide' },
        },
        {
            id: 'pwa-guide',
            type: 'article',
            title: 'PWA Kit Architecture',
            summary: 'Headless storefront overview.',
            url: 'https://example.com/pwa-guide',
            source: { name: 'Source', url: 'https://example.com/' },
            publishedAt: '2026-09-01T00:00:00Z',
            tags: ['pwa-kit'],
            cta: { label: 'Explore architecture' },
        },
    ];

    renderCatalog(root, { promotions: [], editorial: articles });

    const grid = root.querySelector('.card-grid');
    const listBtn = root.querySelector('.view-toggle-btn[data-view="list"]');
    const gridBtn = root.querySelector('.view-toggle-btn[data-view="grid"]');

    assert.ok(listBtn);
    assert.ok(gridBtn);
    assert.equal(grid.classList.contains('is-list-view'), false);

    // Switch to List view
    listBtn.click();
    assert.equal(grid.classList.contains('is-list-view'), true);
    assert.equal(listBtn.classList.contains('is-active'), true);
    assert.equal(gridBtn.classList.contains('is-active'), false);

    // Switch back to Grid view
    gridBtn.click();
    assert.equal(grid.classList.contains('is-list-view'), false);
    assert.equal(gridBtn.classList.contains('is-active'), true);
});

test('calculates reading time and renders reading time badge on cards', () => {
    assert.equal(estimateReadingTime('Short Title', 'Brief summary'), '1 min read');
    assert.equal(estimateReadingTime('', ''), '1 min read');
    const longSummary = 'word '.repeat(380);
    assert.equal(estimateReadingTime('Article', longSummary), '3 min read');

    const root = createRoot();
    const article = {
        id: 'article-read-time',
        type: 'article',
        title: 'Evaluating SFCC Architectures',
        summary: 'A detailed overview of modern commerce architectures.',
        url: 'https://example.com/article',
        source: { name: 'Source', url: 'https://example.com/' },
        publishedAt: '2026-09-02T00:00:00Z',
        tags: ['sfcc'],
        cta: { label: 'Read article' },
    };

    renderCatalog(root, { promotions: [], editorial: [article] });
    const badge = root.querySelector('.card-read-time');
    assert.ok(badge);
    assert.equal(badge.textContent, '1 min read');
});

test('shows and dismisses toast notifications', async () => {
    const root = createRoot();
    const doc = root.ownerDocument;

    const toast = showToast('Test notification', 50, doc);
    assert.ok(toast);
    const container = doc.getElementById('toast-container');
    assert.ok(container);
    assert.equal(container.getAttribute('role'), 'status');
    assert.equal(container.textContent, 'Test notification');

    // Wait for auto dismiss
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(container.childElementCount, 0);
});

test('toggles keyboard shortcuts modal and renders shortcuts list', () => {
    const root = createRoot();
    const doc = root.ownerDocument;

    const modal = toggleShortcutsModal(doc);
    assert.ok(modal);
    assert.equal(modal.id, 'shortcuts-modal');
    assert.equal(modal.getAttribute('role'), 'dialog');
    assert.equal(modal.hasAttribute('hidden'), false);

    const keys = [...modal.querySelectorAll('kbd')].map((k) => k.textContent);
    assert.ok(keys.includes('j'));
    assert.ok(keys.includes('k'));
    assert.ok(keys.includes('b'));
    assert.ok(keys.includes('/'));

    // Toggle again should hide
    toggleShortcutsModal(doc);
    assert.equal(modal.hasAttribute('hidden'), true);

    // Toggle again should unhide
    toggleShortcutsModal(doc);
    assert.equal(modal.hasAttribute('hidden'), false);
});

test('navigates cards and bookmarks active card with keyboard shortcuts', () => {
    const root = createRoot();
    const doc = root.ownerDocument;
    const articles = [
        {
            id: 'card-1',
            type: 'article',
            title: 'Card 1',
            summary: 'Summary 1',
            url: 'https://example.com/1',
            source: { name: 'Source', url: 'https://example.com/' },
            publishedAt: '2026-09-02T00:00:00Z',
            tags: ['sfcc'],
            cta: { label: 'Read' },
        },
        {
            id: 'card-2',
            type: 'article',
            title: 'Card 2',
            summary: 'Summary 2',
            url: 'https://example.com/2',
            source: { name: 'Source', url: 'https://example.com/' },
            publishedAt: '2026-09-01T00:00:00Z',
            tags: ['pwa-kit'],
            cta: { label: 'Read' },
        },
    ];

    renderCatalog(root, { promotions: [], editorial: articles });

    const card1 = root.querySelector('#card-1');
    const card2 = root.querySelector('#card-2');
    assert.ok(card1);
    assert.ok(card2);

    const fireKey = (key) => {
        const event = new doc.defaultView.Event('keydown');
        event.key = key;
        doc.dispatchEvent(event);
    };

    // Press 'j' to select first card
    fireKey('j');
    assert.ok(card1.classList.contains('is-keyboard-active'));
    assert.ok(!card2.classList.contains('is-keyboard-active'));

    // Press 'j' to advance to second card
    fireKey('j');
    assert.ok(!card1.classList.contains('is-keyboard-active'));
    assert.ok(card2.classList.contains('is-keyboard-active'));

    // Press 'b' to bookmark second card
    fireKey('b');
    const bookmarkBtn2 = card2.querySelector('.card-bookmark-btn');
    assert.ok(bookmarkBtn2.classList.contains('is-bookmarked'));

    // Press 'k' to move back to first card
    fireKey('k');
    assert.ok(card1.classList.contains('is-keyboard-active'));
    assert.ok(!card2.classList.contains('is-keyboard-active'));

    // Press 'Escape' to deselect
    fireKey('Escape');
    assert.ok(!card1.classList.contains('is-keyboard-active'));
});

test('filters articles by publication source', () => {
    const root = createRoot();
    const articles = [
        {
            id: 'sf-article',
            type: 'article',
            title: 'Salesforce Update',
            summary: 'Summary 1',
            url: 'https://example.com/1',
            source: { name: 'Salesforce Dev', url: 'https://salesforce.com/' },
            publishedAt: '2026-09-02T00:00:00Z',
            tags: ['sfcc'],
            cta: { label: 'Read' },
        },
        {
            id: 'intent-article',
            type: 'article',
            title: 'IntentFusion Insights',
            summary: 'Summary 2',
            url: 'https://example.com/2',
            source: { name: 'IntentFusion', url: 'https://intentfusion.com/' },
            publishedAt: '2026-09-01T00:00:00Z',
            tags: ['ai'],
            cta: { label: 'Read' },
        },
    ];

    renderCatalog(root, { promotions: [], editorial: articles });

    const sourceSelect = root.querySelector('.source-filter-select');
    assert.ok(sourceSelect);
    assert.equal(sourceSelect.children.length, 3); // All + 2 sources

    // Select IntentFusion (index 2)
    sourceSelect.selectedIndex = 2;
    sourceSelect.children[2].selected = true;
    sourceSelect.dispatchEvent(new root.ownerDocument.defaultView.Event('change'));

    assert.equal(root.querySelector('#sf-article').hidden, true);
    assert.equal(root.querySelector('#intent-article').hidden, false);

    // Select All Sources (index 0)
    sourceSelect.selectedIndex = 0;
    sourceSelect.children[0].selected = true;
    sourceSelect.dispatchEvent(new root.ownerDocument.defaultView.Event('change'));

    assert.equal(root.querySelector('#sf-article').hidden, false);
    assert.equal(root.querySelector('#intent-article').hidden, false);
});

test('tracks read articles and filters unread articles', () => {
    const root = createRoot();
    const doc = root.ownerDocument;
    const articles = [
        {
            id: 'unread-article-1',
            type: 'article',
            title: 'Unread 1',
            summary: 'Summary 1',
            url: 'https://example.com/1',
            source: { name: 'Source', url: 'https://example.com/' },
            publishedAt: '2026-09-02T00:00:00Z',
            tags: ['sfcc'],
            cta: { label: 'Read' },
        },
        {
            id: 'unread-article-2',
            type: 'article',
            title: 'Unread 2',
            summary: 'Summary 2',
            url: 'https://example.com/2',
            source: { name: 'Source', url: 'https://example.com/' },
            publishedAt: '2026-09-01T00:00:00Z',
            tags: ['pwa-kit'],
            cta: { label: 'Read' },
        },
    ];

    renderCatalog(root, { promotions: [], editorial: articles });

    const card1 = root.querySelector('#unread-article-1');
    const card2 = root.querySelector('#unread-article-2');
    assert.ok(!card1.classList.contains('is-read'));

    // Mark card 1 as read
    markArticleRead('unread-article-1', doc);
    assert.ok(card1.classList.contains('is-read'));
    assert.ok(getReadArticles().has('unread-article-1'));

    // Filter bar should now show Unread pill
    const unreadPill = root.querySelector('[data-filter="unread"]');
    assert.ok(unreadPill);
    assert.match(unreadPill.textContent, /Unread \(1\)/);

    // Click Unread pill
    unreadPill.click();
    assert.equal(card1.hidden, true); // read card is hidden
    assert.equal(card2.hidden, false); // unread card is visible
});

test('toggles subscribe modal with feed reader formats', () => {
    const root = createRoot();
    const doc = root.ownerDocument;

    const modal = toggleSubscribeModal(doc, 'https://discover.example/');
    assert.ok(modal);
    assert.equal(modal.id, 'subscribe-modal');
    assert.equal(modal.getAttribute('role'), 'dialog');

    assert.match(modal.textContent, /Live JSON Feed/);
    assert.match(modal.textContent, /RSS 2.0 Feed/);
    assert.match(modal.textContent, /Atom 1.0 Feed/);

    // Toggle hide
    toggleSubscribeModal(doc);
    assert.equal(modal.hasAttribute('hidden'), true);
});

test('generateMarkdownReadingList formats articles as clean markdown', () => {
    const items = [
        {
            id: 'item-1',
            title: 'Modern Headless Architecture',
            summary: 'An overview of decoupled storefronts.',
            url: 'https://example.com/headless',
            source: { name: 'Tech Insights' },
            publishedAt: '2026-09-10T00:00:00Z',
            tags: ['sfcc', 'architecture'],
        },
    ];

    const md = generateMarkdownReadingList(items);
    assert.match(md, /# DWithEase Discover Reading List/);
    assert.match(md, /### 1\. \[Modern Headless Architecture\]\(https:\/\/example\.com\/headless\)/);
    assert.match(md, /\*\*Source:\*\* Tech Insights · \*\*Date:\*\* 2026-09-10/);
    assert.match(md, /> An overview of decoupled storefronts\./);
    assert.match(md, /`#sfcc` `#architecture`/);
});

test('generateOpml generates valid OPML 2.0 XML', () => {
    const opml = generateOpml('https://discover.dwithease.com/');
    assert.match(opml, /<opml version="2\.0">/);
    assert.match(opml, /<title>DWithEase Discover Feeds<\/title>/);
    assert.match(opml, /xmlUrl="https:\/\/discover\.dwithease\.com\/rss\.xml"/);
    assert.match(opml, /xmlUrl="https:\/\/discover\.dwithease\.com\/atom\.xml"/);
    assert.match(opml, /xmlUrl="https:\/\/discover\.dwithease\.com\/feed-live\.json"/);
});

test('renders Export menu in feed controls with Markdown and OPML options', () => {
    const root = createRoot();
    const articles = [
        {
            id: 'art-1',
            type: 'article',
            title: 'Art 1',
            summary: 'Summary 1',
            url: 'https://example.com/1',
            source: { name: 'Src', url: 'https://example.com/' },
            publishedAt: '2026-09-01T00:00:00Z',
            tags: ['tag1'],
            cta: { label: 'Read' },
        },
        {
            id: 'art-2',
            type: 'article',
            title: 'Art 2',
            summary: 'Summary 2',
            url: 'https://example.com/2',
            source: { name: 'Src', url: 'https://example.com/' },
            publishedAt: '2026-09-02T00:00:00Z',
            tags: ['tag2'],
            cta: { label: 'Read' },
        },
    ];

    renderCatalog(root, { promotions: [], editorial: articles }, new Map());

    const exportBtn = root.querySelector('.export-action-btn');
    assert.ok(exportBtn);
    assert.equal(exportBtn.textContent.trim(), 'Export ▾');

    const dropdown = root.querySelector('.export-dropdown');
    assert.ok(dropdown);
    assert.equal(dropdown.hidden, true);

    // Click to toggle open
    exportBtn.click();
    assert.equal(dropdown.hidden, false);
    assert.equal(exportBtn.getAttribute('aria-expanded'), 'true');

    // Check items
    const items = dropdown.querySelectorAll('.export-dropdown-item');
    assert.equal(items.length, 2);
    assert.match(items[0].textContent, /Reading List/);
    assert.match(items[1].textContent, /Feed Readers/);
});
