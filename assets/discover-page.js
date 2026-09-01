import {
    buildCatalog,
    isHttpsUrl,
    selectFeedName,
} from './feed-model.js';

const FALLBACK_IMAGE = 'assets/discover-fallback.png';

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

function formattedDate(value) {
    return new Intl.DateTimeFormat('en', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(value));
}

function feedItemCard(document, item) {
    const card = node(document, 'article', `discover-card feed-card ${item.type}-card`);
    card.dataset.itemId = item.id;

    if (item.image?.src) {
        card.append(feedImage(document, item.image.src, 'feed-image', item.image.alt));
    }

    const body = node(document, 'div', 'card-body');
    if (item.type === 'promotion') {
        body.append(node(document, 'p', 'eyebrow', 'Featured'));
    }

    const metadata = node(document, 'p', 'card-meta');
    metadata.append(node(document, 'span', 'card-source', item.source.name));
    metadata.append(node(document, 'span', 'card-date', formattedDate(item.publishedAt)));
    body.append(metadata);
    body.append(node(document, 'h3', 'card-title', item.title));
    body.append(node(document, 'p', 'card-copy', item.summary));

    const tags = node(document, 'div', 'tag-list');
    item.tags.forEach((tag) => tags.append(node(document, 'span', 'tag', tag)));
    body.append(tags);

    const href = safeHttps(item.url);
    if (href) {
        const actions = node(document, 'div', 'card-actions');
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

function emptyState(document) {
    const state = node(document, 'section', 'state-card empty-state');
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

export function renderCatalog(root, catalog) {
    const { ownerDocument: document } = root;
    root.replaceChildren();

    if (catalog.promotions.length) {
        root.append(section(
            document,
            'Featured tools',
            catalog.promotions,
            (item) => feedItemCard(document, item),
        ));
    }
    if (catalog.editorial.length) {
        root.append(section(
            document,
            'Latest from commerce',
            catalog.editorial,
            (item) => feedItemCard(document, item),
        ));
    }

    if (!root.childElementCount) root.append(emptyState(document));
}

export function renderError(root, retry) {
    const { ownerDocument: document } = root;
    const state = node(document, 'section', 'state-card error-state');
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

export async function startDiscoverPage({
    root,
    search = '',
    fetchImpl = fetch,
    now = Date.now(),
}) {
    const channel = selectFeedName(search);
    const feedUrl = `feed-${channel}.json`;
    root.dataset.feed = channel;
    renderLoading(root);

    try {
        const feedResponse = await fetchImpl(feedUrl, { cache: 'no-store' });
        if (!feedResponse.ok) throw new Error(`Feed request failed: ${feedResponse.status}`);

        const feed = await feedResponse.json();
        renderCatalog(root, buildCatalog(feed, now));
    } catch {
        renderError(root, () => startDiscoverPage({ root, search, fetchImpl, now: Date.now() }));
    }
}

if (typeof document !== 'undefined') {
    const root = document.getElementById('discover-content');
    if (root) startDiscoverPage({ root, search: window.location.search });
}
