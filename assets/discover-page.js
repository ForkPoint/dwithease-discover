import {
    buildCatalog,
    createImageMap,
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
    try {
        return new URL(value).protocol === 'https:' ? value : '';
    } catch {
        return '';
    }
}

function actionLink(document, href, label, className = 'button') {
    const link = node(document, 'a', className, label);
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
}

function feedImage(document, source, className) {
    const image = node(document, 'img', className);
    image.src = source || FALLBACK_IMAGE;
    image.alt = '';
    image.loading = 'lazy';
    image.addEventListener('error', () => {
        if (!image.src.endsWith(FALLBACK_IMAGE)) image.src = FALLBACK_IMAGE;
    });
    return image;
}

function productCard(document, product, images) {
    const card = node(document, 'article', 'discover-card product-card');
    card.dataset.productId = product.productId;
    card.append(feedImage(document, images[product.imageId], 'product-image'));

    const body = node(document, 'div', 'card-body');
    body.append(node(document, 'p', 'eyebrow', 'From ForkPoint'));
    body.append(node(document, 'h3', 'card-title', product.name));
    body.append(node(document, 'p', 'card-copy', product.benefit));

    const href = safeHttps(product.url);
    if (href) {
        const actions = node(document, 'div', 'card-actions');
        actions.append(actionLink(document, href, product.ctaLabel));
        body.append(actions);
    }

    card.append(body);
    return card;
}

function updateCard(document, update, images, index) {
    const card = node(document, 'article', 'discover-card update-card');
    card.dataset.updateId = String(update.id ?? index);

    const row = node(document, 'div', 'update-row');
    row.append(feedImage(document, images[update.icon], 'update-icon'));

    const body = node(document, 'div', 'card-body');
    body.append(node(document, 'h3', 'card-title', String(update.title ?? '')));
    body.append(node(
        document,
        'p',
        'card-copy update-copy',
        String(update.body ?? '').split('\\n').join('\n'),
    ));
    row.append(body);
    card.append(row);

    const href = safeHttps(update.link);
    if (href) {
        const actions = node(document, 'div', 'card-actions');
        actions.append(actionLink(
            document,
            href,
            String(update.buttonText || update.actionButton || 'Learn more'),
            'text-link',
        ));
        card.append(actions);
    }

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
        'There are no products to discover right now.',
    ));
    state.append(copy);
    return state;
}

export function renderCatalog(root, catalog, images) {
    const { ownerDocument: document } = root;
    root.replaceChildren();

    if (catalog.ecommerce.length) {
        root.append(section(
            document,
            'E-commerce',
            catalog.ecommerce,
            (product) => productCard(document, product, images),
        ));
    }
    if (catalog.webDevelopment.length) {
        root.append(section(
            document,
            'Web Development',
            catalog.webDevelopment,
            (product) => productCard(document, product, images),
        ));
    }
    if (catalog.updates.length) {
        root.append(section(
            document,
            'Updates',
            catalog.updates,
            (update, index) => updateCard(document, update, images, index),
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
    const imagesUrl = `images-${channel}.json`;
    root.dataset.feed = channel;
    renderLoading(root);

    try {
        const feedResponse = await fetchImpl(feedUrl, { cache: 'no-store' });
        if (!feedResponse.ok) throw new Error(`Feed request failed: ${feedResponse.status}`);

        const feed = await feedResponse.json();
        const imageResponse = await fetchImpl(imagesUrl, { cache: 'no-store' });
        const imageData = imageResponse.ok ? await imageResponse.json() : { images: [] };
        renderCatalog(root, buildCatalog(feed, now), createImageMap(imageData));
    } catch {
        renderError(root, () => startDiscoverPage({ root, search, fetchImpl, now: Date.now() }));
    }
}

if (typeof document !== 'undefined') {
    const root = document.getElementById('discover-content');
    if (root) startDiscoverPage({ root, search: window.location.search });
}
