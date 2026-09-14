import {
    buildCatalog,
    buildSourceRegistry,
    isHttpsUrl,
    selectFeedName,
} from './feed-model.js';

const FALLBACK_IMAGE = 'assets/discover-fallback.png';
const FALLBACK_SOURCE_ICON = 'assets/sources/source-fallback.svg';

function node(document, tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function safeHttps(value) {
    return isHttpsUrl(value) ? value : '';
}

function actionLink(document, href, label, className = 'button') {
    const link = node(document, 'a', className, label);
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
}

function shareIcon(document) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');

    const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path1.setAttribute('d', 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71');
    const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path2.setAttribute('d', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71');

    svg.append(path1, path2);
    return svg;
}

function feedImage(document, source, className, alt = '') {
    const image = node(document, 'img', className);
    image.src = source || FALLBACK_IMAGE;
    image.alt = alt;
    image.loading = 'lazy';
    image.addEventListener('error', () => {
        if (!image.src.endsWith(FALLBACK_IMAGE)) image.src = FALLBACK_IMAGE;
    });
    return image;
}

function sourceIcon(document, source, sources) {
    const image = node(document, 'img', 'source-icon');
    image.src = sources.get(source.url)?.icon || FALLBACK_SOURCE_ICON;
    image.dataset.sourceUrl = source.url;
    image.alt = '';
    image.setAttribute('width', '28');
    image.setAttribute('height', '28');
    image.addEventListener('error', () => {
        if (!image.src.endsWith(FALLBACK_SOURCE_ICON)) image.src = FALLBACK_SOURCE_ICON;
    });
    return image;
}

function applySourceIcons(root, sources) {
    for (const image of root.querySelectorAll('.source-icon')) {
        const icon = sources.get(image.dataset.sourceUrl)?.icon;
        if (icon) image.src = icon;
    }
}

function formattedDate(value) {
    return new Intl.DateTimeFormat('en', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(value));
}

const TOPIC_PRESETS = [
    { id: 'all', label: 'All' },
    { id: 'sfcc', label: 'SFCC' },
    { id: 'pwa-kit', label: 'PWA Kit' },
    { id: 'release-notes', label: 'Releases' },
    { id: 'ai', label: 'AI & Agents' },
    { id: 'agentic-commerce', label: 'Agentic' },
    { id: 'strategy', label: 'Strategy' },
    { id: 'developer-tools', label: 'Dev Tools' },
];

function extractFilters(editorial) {
    if (!editorial || editorial.length <= 1) return [];
    const tagCounts = new Map();
    editorial.forEach((item) => {
        (item.tags || []).forEach((tag) => {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        });
    });

    const available = [{ id: 'all', label: `All (${editorial.length})` }];
    TOPIC_PRESETS.slice(1).forEach((preset) => {
        const count = tagCounts.get(preset.id);
        if (count) {
            available.push({
                id: preset.id,
                label: `${preset.label} (${count})`,
            });
        }
    });
    return available.length > 1 ? available : [];
}

function feedItemCard(document, item, sources) {
    const card = node(document, 'article', `discover-card feed-card ${item.type}-card`);
    card.id = item.id;
    card.dataset.itemId = item.id;

    if (item.image?.src) {
        card.append(feedImage(document, item.image.src, 'feed-image', item.image.alt));
    }

    const body = node(document, 'div', 'card-body');
    if (item.type === 'promotion') {
        body.append(node(document, 'p', 'eyebrow eyebrow-featured', 'Featured Tool'));
    }

    const metadata = node(document, 'p', 'card-meta');
    const source = node(document, 'span', 'card-source-group');
    source.append(sourceIcon(document, item.source, sources));
    source.append(node(document, 'span', 'card-source', item.source.name));
    metadata.append(source);
    metadata.append(node(document, 'span', 'card-date', formattedDate(item.publishedAt)));
    body.append(metadata);

    const href = safeHttps(item.url);
    const title = node(document, 'h3', 'card-title');
    if (href) {
        title.append(actionLink(document, href, item.title, 'card-title-link'));
    } else {
        title.textContent = item.title;
    }
    body.append(title);

    body.append(node(document, 'p', 'card-copy', item.summary));

    const tags = node(document, 'div', 'tag-list');
    item.tags.forEach((tag) => {
        const tagEl = node(document, 'span', 'tag', tag);
        tagEl.dataset.tag = tag;
        tags.append(tagEl);
    });
    body.append(tags);

    if (href) {
        const actions = node(document, 'div', 'card-actions');
        const shareBtn = node(document, 'button', 'card-share-btn');
        shareBtn.type = 'button';
        shareBtn.setAttribute('aria-label', 'Copy link to this card');
        shareBtn.title = 'Copy link';
        shareBtn.append(shareIcon(document));
        shareBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                const current = typeof window !== 'undefined' && window.location?.href
                    ? window.location.href
                    : 'https://discover.dwithease.com/';
                const cardUrl = new URL(current);
                cardUrl.hash = item.id;
                if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(cardUrl.href);
                }
                shareBtn.classList.add('is-copied');
                shareBtn.title = 'Copied!';
                setTimeout(() => {
                    shareBtn.classList.remove('is-copied');
                    shareBtn.title = 'Copy link';
                }, 1800);
            } catch {
                // Clipboard fallback
            }
        });
        actions.append(shareBtn);
        actions.append(actionLink(
            document,
            href,
            item.cta.label,
            item.type === 'promotion' ? 'button' : 'text-link',
        ));
        body.append(actions);
    }

    card.append(body);
    return card;
}

function section(document, title, items, renderItem) {
    const wrapper = node(document, 'section', 'discover-section');
    wrapper.append(node(document, 'h2', 'section-title', title));
    wrapper.lastElementChild.dataset.sectionTitle = '';

    const grid = node(document, 'div', 'card-grid');
    items.forEach((item, index) => grid.append(renderItem(item, index)));
    wrapper.append(grid);
    return wrapper;
}

function editorialSection(document, title, items, sources) {
    const wrapper = node(document, 'section', 'discover-section');
    wrapper.append(node(document, 'h2', 'section-title', title));
    wrapper.lastElementChild.dataset.sectionTitle = '';

    const cardEntries = items.map((item) => ({
        item,
        card: feedItemCard(document, item, sources),
    }));

    const grid = node(document, 'div', 'card-grid');
    cardEntries.forEach(({ card }) => grid.append(card));

    const emptyNotice = node(document, 'div', 'filter-empty-state');
    emptyNotice.hidden = true;
    emptyNotice.append(node(document, 'p', 'filter-empty-text', 'No articles match the selected topic.'));

    const filters = extractFilters(items);
    if (filters.length > 1) {
        const bar = node(document, 'div', 'filter-bar');
        bar.setAttribute('role', 'toolbar');
        bar.setAttribute('aria-label', 'Filter articles by topic');

        let currentFilter = 'all';

        const applyFilter = (filterId) => {
            currentFilter = filterId;
            bar.querySelectorAll('.filter-pill').forEach((btn) => {
                const isActive = btn.dataset.filter === currentFilter;
                btn.classList.toggle('is-active', isActive);
                btn.setAttribute('aria-pressed', String(isActive));
            });

            let visibleCount = 0;
            cardEntries.forEach(({ item, card }) => {
                const matches = currentFilter === 'all' || item.tags?.includes(currentFilter);
                card.hidden = !matches;
                if (matches) visibleCount += 1;
            });

            emptyNotice.hidden = visibleCount > 0;
        };

        const resetBtn = node(document, 'button', 'filter-reset-btn', 'Show all articles');
        resetBtn.type = 'button';
        resetBtn.addEventListener('click', () => applyFilter('all'));
        emptyNotice.append(resetBtn);

        filters.forEach((filter) => {
            const btn = node(document, 'button', 'filter-pill', filter.label);
            btn.type = 'button';
            btn.dataset.filter = filter.id;
            if (filter.id === 'all') {
                btn.classList.add('is-active');
                btn.setAttribute('aria-pressed', 'true');
            } else {
                btn.setAttribute('aria-pressed', 'false');
            }
            btn.addEventListener('click', () => applyFilter(filter.id));
            bar.append(btn);
        });

        cardEntries.forEach(({ card }) => {
            card.querySelectorAll('.tag').forEach((tagSpan) => {
                const tagId = tagSpan.dataset.tag;
                if (filters.some((f) => f.id === tagId)) {
                    tagSpan.classList.add('interactive-tag');
                    tagSpan.title = `Filter by #${tagId}`;
                    tagSpan.addEventListener('click', () => applyFilter(tagId));
                }
            });
        });

        wrapper.append(bar);
    }

    wrapper.append(grid);
    wrapper.append(emptyNotice);
    return wrapper;
}

function emptyState(document) {
    const state = node(document, 'section', 'state-card empty-state');
    state.setAttribute('role', 'status');
    state.dataset.testid = 'discover-empty';
    state.append(node(document, 'span', 'state-icon', 'D'));

    const copy = node(document, 'div');
    copy.append(node(document, 'h2', 'state-title', 'Nothing new right now'));
    copy.append(node(
        document,
        'p',
        'state-copy',
        'There are no articles or tools to discover right now.',
    ));
    state.append(copy);
    return state;
}

export function renderCatalog(root, catalog, sources = new Map()) {
    const { ownerDocument: document } = root;
    root.replaceChildren();

    if (catalog.promotions.length) {
        root.append(section(
            document,
            'Featured tools',
            catalog.promotions,
            (item) => feedItemCard(document, item, sources),
        ));
    }
    if (catalog.editorial.length) {
        root.append(editorialSection(
            document,
            'Latest from commerce',
            catalog.editorial,
            sources,
        ));
    }

    if (!root.childElementCount) root.append(emptyState(document));
}

export function renderError(root, retry) {
    const { ownerDocument: document } = root;
    const state = node(document, 'section', 'state-card error-state');
    state.setAttribute('role', 'alert');
    const copy = node(document, 'div');
    copy.append(node(document, 'h2', 'state-title', 'Discover could not load'));
    copy.append(node(document, 'p', 'state-copy', 'Check your connection and try again.'));

    const button = node(document, 'button', 'button', 'Try again');
    button.type = 'button';
    button.addEventListener('click', retry);
    state.append(copy, button);
    root.replaceChildren(state);
}

function renderLoading(root) {
    const { ownerDocument: document } = root;
    const loading = node(document, 'div', 'loading-grid');
    loading.setAttribute('aria-label', 'Loading Discover');
    loading.setAttribute('aria-live', 'polite');
    loading.append(node(document, 'div', 'loading-card'));
    loading.append(node(document, 'div', 'loading-card'));
    root.replaceChildren(loading);
}

async function loadSourceRegistry(fetchImpl, pageUrl) {
    try {
        const response = await fetchImpl('sources.json', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Source request failed: ${response.status}`);
        const registryUrl = response.url || new URL('sources.json', pageUrl).href;
        return buildSourceRegistry(await response.json(), registryUrl, pageUrl);
    } catch {
        return new Map();
    }
}

export async function startDiscoverPage({
    root,
    search = '',
    fetchImpl = fetch,
    now = Date.now(),
    pageUrl = root.ownerDocument.baseURI,
}) {
    const channel = selectFeedName(search);
    const feedUrl = `feed-${channel}.json`;
    root.dataset.feed = channel;
    renderLoading(root);

    try {
        const feedPromise = fetchImpl(feedUrl, { cache: 'no-store' });
        const sourcesPromise = loadSourceRegistry(fetchImpl, pageUrl);
        const feedResponse = await feedPromise;
        if (!feedResponse.ok) throw new Error(`Feed request failed: ${feedResponse.status}`);

        const feed = await feedResponse.json();
        renderCatalog(root, buildCatalog(feed, now));
        void sourcesPromise.then((sources) => applySourceIcons(root, sources));
    } catch {
        renderError(root, () => startDiscoverPage({
            root,
            search,
            fetchImpl,
            now: Date.now(),
            pageUrl,
        }));
    }
}

if (typeof document !== 'undefined') {
    const root = document.getElementById('discover-content');
    if (root) startDiscoverPage({ root, search: window.location.search });
}
