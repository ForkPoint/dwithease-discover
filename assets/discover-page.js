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

let memoryBookmarks = new Set();
let memoryView = 'grid';

function safeStorage() {
    try {
        if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    } catch {
        // Storage restricted
    }
    return null;
}

export function getBookmarks() {
    const storage = safeStorage();
    if (!storage) return memoryBookmarks;
    try {
        const raw = storage.getItem('dwithease_discover_bookmarks');
        return new Set(raw ? JSON.parse(raw) : []);
    } catch {
        return memoryBookmarks;
    }
}

export function setBookmarks(set) {
    memoryBookmarks = set;
    const storage = safeStorage();
    if (!storage) return;
    try {
        storage.setItem('dwithease_discover_bookmarks', JSON.stringify([...set]));
    } catch {
        // Storage restricted
    }
}

const bookmarkListeners = new Set();

export function onBookmarksUpdated(listener) {
    bookmarkListeners.add(listener);
    return () => bookmarkListeners.delete(listener);
}

function notifyBookmarksUpdated(id) {
    for (const listener of bookmarkListeners) {
        try { listener(id); } catch { /* ignore */ }
    }
}

const READ_STORAGE_KEY = 'dwithease_discover_read';
let memoryReadArticles = new Set();
const readListeners = new Set();

export function getReadArticles() {
    const storage = safeStorage();
    if (!storage) return memoryReadArticles;
    try {
        const raw = storage.getItem(READ_STORAGE_KEY);
        return new Set(raw ? JSON.parse(raw) : []);
    } catch {
        return memoryReadArticles;
    }
}

export function setReadArticles(set) {
    memoryReadArticles = set;
    const storage = safeStorage();
    if (storage) {
        try {
            storage.setItem(READ_STORAGE_KEY, JSON.stringify([...set]));
        } catch {
            // Storage restricted
        }
    }
}

export function onReadUpdated(listener) {
    readListeners.add(listener);
    return () => readListeners.delete(listener);
}

function notifyReadUpdated(id) {
    for (const listener of readListeners) {
        try { listener(id); } catch { /* ignore */ }
    }
}

export function markArticleRead(id, doc = typeof document !== 'undefined' ? document : null) {
    if (!id) return;
    const readSet = getReadArticles();
    if (!readSet.has(id)) {
        readSet.add(id);
        setReadArticles(readSet);
        if (doc) {
            const card = doc.getElementById(id) || doc.querySelector(`[data-item-id="${id}"]`);
            if (card) card.classList.add('is-read');
        }
        notifyReadUpdated(id);
    }
}

export function getViewPreference() {
    const storage = safeStorage();
    if (!storage) return memoryView;
    try {
        return storage.getItem('dwithease_discover_view') || memoryView;
    } catch {
        return memoryView;
    }
}

export function setViewPreference(view) {
    memoryView = view;
    const storage = safeStorage();
    if (!storage) return;
    try {
        storage.setItem('dwithease_discover_view', view);
    } catch {
        // Storage restricted
    }
}

const THEME_STORAGE_KEY = 'dwithease_discover_theme';
let memoryTheme = 'system';

export function getThemePreference() {
    const storage = safeStorage();
    if (!storage) return memoryTheme;
    try {
        return storage.getItem(THEME_STORAGE_KEY) || memoryTheme;
    } catch {
        return memoryTheme;
    }
}

export function setThemePreference(theme, document) {
    memoryTheme = theme;
    const storage = safeStorage();
    if (storage) {
        try {
            if (theme === 'system') {
                storage.removeItem(THEME_STORAGE_KEY);
            } else {
                storage.setItem(THEME_STORAGE_KEY, theme);
            }
        } catch {
            // Storage restricted
        }
    }
    applyTheme(theme, document);
}

export function applyTheme(theme, doc = typeof document !== 'undefined' ? document : null) {
    if (!doc || !doc.documentElement) return;
    const root = doc.documentElement;
    if (theme === 'dark') {
        root.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
        root.setAttribute('data-theme', 'light');
    } else {
        root.removeAttribute('data-theme');
    }
}

export function estimateReadingTime(title, summary) {
    const text = `${title || ''} ${summary || ''}`.trim();
    if (!text) return '1 min read';
    const words = text.split(/\s+/).filter(Boolean).length;
    const minutes = Math.max(1, Math.ceil(words / 180));
    return `${minutes} min read`;
}

export function generateMarkdownReadingList(items = []) {
    const timestamp = new Date().toISOString().split('T')[0];
    const header = `# DWithEase Discover Reading List\n\nExported on ${timestamp} (${items.length} article${items.length === 1 ? '' : 's'})\n\n---\n\n`;
    const entries = items.map((item, index) => {
        const sourceName = item.source?.name || 'Publication';
        const date = item.publishedAt ? item.publishedAt.split('T')[0] : '';
        const tags = (item.tags || []).map((t) => `\`#${t}\``).join(' ');
        return `### ${index + 1}. [${item.title}](${item.url})\n**Source:** ${sourceName}${date ? ` · **Date:** ${date}` : ''}\n\n> ${item.summary}\n\n${tags ? `${tags}\n\n` : ''}---\n`;
    }).join('\n');
    return header + entries;
}

export function generateOpml(siteUrl = 'https://discover.dwithease.com/') {
    const channelUrl = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
    const now = new Date().toUTCString();
    return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>DWithEase Discover Feeds</title>
    <dateCreated>${now}</dateCreated>
    <ownerName>DWithEase</ownerName>
    <ownerId>${channelUrl}</ownerId>
  </head>
  <body>
    <outline text="Commerce Feeds" title="Commerce Feeds">
      <outline type="rss" text="DWithEase Discover (RSS 2.0)" title="DWithEase Discover (RSS 2.0)" xmlUrl="${channelUrl}rss.xml" htmlUrl="${channelUrl}"/>
      <outline type="atom" text="DWithEase Discover (Atom 1.0)" title="DWithEase Discover (Atom 1.0)" xmlUrl="${channelUrl}atom.xml" htmlUrl="${channelUrl}"/>
      <outline type="json" text="DWithEase Discover (JSON Feed)" title="DWithEase Discover (JSON Feed)" xmlUrl="${channelUrl}feed-live.json" htmlUrl="${channelUrl}"/>
    </outline>
  </body>
</opml>`;
}

export function triggerFileDownload(filename, content, mimeType = 'text/plain;charset=utf-8') {
    if (typeof document === 'undefined' || !document.createElement) return;
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function showToast(message, duration = 2500, doc = typeof document !== 'undefined' ? document : null) {
    if (!doc) return null;
    const mount = doc.body || doc.documentElement;
    if (!mount) return null;

    let container = doc.getElementById('toast-container');
    if (!container) {
        container = node(doc, 'div', 'toast-container');
        container.id = 'toast-container';
        container.setAttribute('role', 'status');
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-atomic', 'true');
        mount.append(container);
    }

    const toast = node(doc, 'div', 'toast');
    toast.append(node(doc, 'span', 'toast-text', message));
    container.append(toast);

    const dismiss = () => {
        toast.classList.add('is-exiting');
        setTimeout(() => {
            if (toast.parentElement) toast.remove();
        }, 190);
    };

    toast.addEventListener('click', dismiss);
    if (duration > 0) {
        setTimeout(dismiss, duration);
    }
    return toast;
}

export function toggleShortcutsModal(document) {
    if (!document) return null;
    let modal = document.getElementById('shortcuts-modal');
    if (modal) {
        if (modal.hasAttribute('hidden')) {
            modal.removeAttribute('hidden');
            const closeBtn = modal.querySelector('.modal-close-btn');
            if (closeBtn) closeBtn.focus();
        } else {
            modal.setAttribute('hidden', '');
        }
        return modal;
    }

    const mount = document.body || document.documentElement;
    modal = node(document, 'div', 'shortcuts-modal-overlay');
    modal.id = 'shortcuts-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Keyboard Shortcuts');

    const dialog = node(document, 'div', 'shortcuts-modal-dialog');
    const header = node(document, 'div', 'shortcuts-modal-header');
    header.append(node(document, 'h2', 'shortcuts-modal-title', 'Keyboard Shortcuts'));

    const closeBtn = node(document, 'button', 'modal-close-btn', '×');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close keyboard shortcuts modal');
    closeBtn.addEventListener('click', () => modal.setAttribute('hidden', ''));
    header.append(closeBtn);
    dialog.append(header);

    const shortcutsList = [
        { keys: ['j', 'k'], desc: 'Navigate articles' },
        { keys: ['o', 'Enter'], desc: 'Open active article' },
        { keys: ['b'], desc: 'Bookmark active article' },
        { keys: ['/'], desc: 'Focus search input' },
        { keys: ['Esc'], desc: 'Clear search / Close modal' },
        { keys: ['?'], desc: 'Toggle shortcuts cheatsheet' },
    ];

    const list = node(document, 'dl', 'shortcuts-list');
    for (const item of shortcutsList) {
        const row = node(document, 'div', 'shortcuts-row');
        const dt = node(document, 'dt', 'shortcuts-keys');
        item.keys.forEach((k, i) => {
            if (i > 0) dt.append(document.createTextNode(' / '));
            const kbd = node(document, 'kbd', 'shortcut-kbd', k);
            dt.append(kbd);
        });
        const dd = node(document, 'dd', 'shortcuts-desc', item.desc);
        row.append(dt, dd);
        list.append(row);
    }
    dialog.append(list);
    modal.append(dialog);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.setAttribute('hidden', '');
    });

    mount.append(modal);
    closeBtn.focus();
    return modal;
}

export function toggleSubscribeModal(document, pageUrl = typeof window !== 'undefined' ? window.location?.href : 'https://discover.dwithease.com/') {
    if (!document) return null;
    let modal = document.getElementById('subscribe-modal');
    if (modal) {
        if (modal.hasAttribute('hidden')) {
            modal.removeAttribute('hidden');
            const closeBtn = modal.querySelector('.modal-close-btn');
            if (closeBtn) closeBtn.focus();
        } else {
            modal.setAttribute('hidden', '');
        }
        return modal;
    }

    const mount = document.body || document.documentElement;
    modal = node(document, 'div', 'shortcuts-modal-overlay subscribe-modal-overlay');
    modal.id = 'subscribe-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Subscribe to Feed');

    const dialog = node(document, 'div', 'shortcuts-modal-dialog subscribe-modal-dialog');
    const header = node(document, 'div', 'shortcuts-modal-header');
    header.append(node(document, 'h2', 'shortcuts-modal-title', 'Subscribe to Feed'));

    const closeBtn = node(document, 'button', 'modal-close-btn', '×');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close subscribe modal');
    closeBtn.addEventListener('click', () => modal.setAttribute('hidden', ''));
    header.append(closeBtn);
    dialog.append(header);

    const intro = node(document, 'p', 'subscribe-intro', 'Add DWithEase Discover to your favorite feed reader (NetNewsWire, Reeder, Feedly, etc.):');
    dialog.append(intro);

    const base = pageUrl || 'https://discover.dwithease.com/';
    const feeds = [
        { name: 'Live JSON Feed', url: new URL('feed-live.json', base).href, type: 'JSON', desc: 'Full-fidelity JSON feed' },
        { name: 'RSS 2.0 Feed', url: new URL('rss.xml', base).href, type: 'RSS', desc: 'Standard XML feed for reader apps', appLink: true },
        { name: 'Atom 1.0 Feed', url: new URL('atom.xml', base).href, type: 'Atom', desc: 'Syndication format' },
    ];

    const feedList = node(document, 'div', 'subscribe-feed-list');
    for (const f of feeds) {
        const row = node(document, 'div', 'subscribe-feed-row');
        const info = node(document, 'div', 'subscribe-feed-info');
        const titleRow = node(document, 'div', 'subscribe-feed-title-row');
        titleRow.append(node(document, 'strong', 'subscribe-feed-name', f.name));
        titleRow.append(node(document, 'span', 'tag', f.type));
        info.append(titleRow);
        info.append(node(document, 'span', 'subscribe-feed-desc', f.desc));
        row.append(info);

        const actions = node(document, 'div', 'subscribe-feed-actions');
        const copyBtn = node(document, 'button', 'button', 'Copy URL');
        copyBtn.type = 'button';
        copyBtn.addEventListener('click', async () => {
            try {
                if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(f.url);
                }
                copyBtn.textContent = 'Copied!';
                showToast(`${f.name} URL copied to clipboard!`, 2500, document);
                setTimeout(() => { copyBtn.textContent = 'Copy URL'; }, 1800);
            } catch {
                showToast('URL copied!', 2500, document);
            }
        });
        actions.append(copyBtn);

        if (f.appLink) {
            const appUrl = f.url.replace(/^https?:\/\//, 'feed://');
            const openLink = node(document, 'a', 'text-link', 'Open app');
            openLink.href = appUrl;
            openLink.title = 'Open in NetNewsWire / Reeder';
            actions.append(openLink);
        }

        row.append(actions);
        feedList.append(row);
    }
    dialog.append(feedList);

    const readerSection = node(document, 'div', 'subscribe-quick-readers');
    readerSection.append(node(document, 'span', 'subscribe-quick-label', 'Quick web readers: '));
    const rssUrl = encodeURIComponent(new URL('rss.xml', base).href);
    const feedly = actionLink(document, `https://feedly.com/i/subscription/feed/${rssUrl}`, 'Feedly', 'text-link');
    const inoreader = actionLink(document, `https://www.inoreader.com/?add_feed=${rssUrl}`, 'Inoreader', 'text-link');
    readerSection.append(feedly, inoreader);
    dialog.append(readerSection);

    modal.append(dialog);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.setAttribute('hidden', '');
    });

    mount.append(modal);
    closeBtn.focus();
    return modal;
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

function bookmarkIcon(document, isFilled = false) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', isFilled ? 'currentColor' : 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z');
    svg.append(path);
    return svg;
}

function markdownIcon(document) {
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

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '2');
    rect.setAttribute('y', '4');
    rect.setAttribute('width', '20');
    rect.setAttribute('height', '16');
    rect.setAttribute('rx', '2');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M6 15V9l3 3 3-3v6m5-4l2 2 2-2m-2 2V9');
    svg.append(rect, path);
    return svg;
}

function searchIcon(document) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '15');
    svg.setAttribute('height', '15');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '11');
    circle.setAttribute('cy', '11');
    circle.setAttribute('r', '8');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '21');
    line.setAttribute('y1', '21');
    line.setAttribute('x2', '16.65');
    line.setAttribute('y2', '16.65');
    svg.append(circle, line);
    return svg;
}

function systemIcon(document) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '2');
    rect.setAttribute('y', '3');
    rect.setAttribute('width', '20');
    rect.setAttribute('height', '14');
    rect.setAttribute('rx', '2');
    const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line1.setAttribute('x1', '8');
    line1.setAttribute('y1', '21');
    line1.setAttribute('x2', '16');
    line1.setAttribute('y2', '21');
    const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line2.setAttribute('x1', '12');
    line2.setAttribute('y1', '17');
    line2.setAttribute('x2', '12');
    line2.setAttribute('y2', '21');
    svg.append(rect, line1, line2);
    return svg;
}

function sunIcon(document) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '5');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42');
    svg.append(circle, path);
    return svg;
}

function moonIcon(document) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z');
    svg.append(path);
    return svg;
}

export function themeSwitcher(document) {
    const group = node(document, 'div', 'theme-switcher');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'Color theme');

    const options = [
        { id: 'system', label: 'System theme', title: 'Follow system theme', createIcon: systemIcon },
        { id: 'light', label: 'Light theme', title: 'Light theme', createIcon: sunIcon },
        { id: 'dark', label: 'Dark theme', title: 'Dark theme', createIcon: moonIcon },
    ];

    const currentTheme = getThemePreference();

    for (const opt of options) {
        const isActive = currentTheme === opt.id;
        const btn = node(document, 'button', `theme-btn${isActive ? ' is-active' : ''}`);
        btn.type = 'button';
        btn.dataset.themeOption = opt.id;
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', String(isActive));
        btn.setAttribute('aria-label', opt.label);
        btn.title = opt.title;
        btn.append(opt.createIcon(document));

        btn.addEventListener('click', () => {
            for (const b of group.querySelectorAll('.theme-btn')) {
                b.classList.remove('is-active');
                b.setAttribute('aria-checked', 'false');
            }
            btn.classList.add('is-active');
            btn.setAttribute('aria-checked', 'true');
            setThemePreference(opt.id, document);
        });

        group.append(btn);
    }

    return group;
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
    const frame = node(document, 'picture', 'source-icon-frame');
    const image = node(document, 'img', 'source-icon');
    const sourceData = sources.get(source.url);
    image.src = sourceData?.icon || FALLBACK_SOURCE_ICON;
    image.dataset.sourceUrl = source.url;
    image.alt = '';
    image.setAttribute('width', '28');
    image.setAttribute('height', '28');
    image.addEventListener('error', () => {
        if (!image.src.endsWith(FALLBACK_SOURCE_ICON)) image.src = FALLBACK_SOURCE_ICON;
    });

    if (sourceData?.iconDark) {
        image.dataset.hasDualIcon = 'true';
        const darkSource = node(document, 'source');
        darkSource.setAttribute('srcset', sourceData.iconDark);
        darkSource.setAttribute('media', '(prefers-color-scheme: dark)');
        frame.append(darkSource);
    }
    frame.append(image);
    return frame;
}

function applySourceIcons(root, sources) {
    for (const image of root.querySelectorAll('.source-icon')) {
        const sourceData = sources.get(image.dataset.sourceUrl);
        if (!sourceData) continue;
        if (sourceData.icon) image.src = sourceData.icon;
        const parent = image.parentElement;
        if (sourceData.iconDark) {
            image.dataset.hasDualIcon = 'true';
            if (parent && parent.tagName.toLowerCase() === 'picture') {
                let darkSource = parent.querySelector('source[media*="prefers-color-scheme: dark"]');
                if (!darkSource) {
                    darkSource = image.ownerDocument.createElement('source');
                    darkSource.setAttribute('media', '(prefers-color-scheme: dark)');
                    parent.prepend(darkSource);
                }
                darkSource.setAttribute('srcset', sourceData.iconDark);
            }
        } else {
            delete image.dataset.hasDualIcon;
            if (parent && parent.tagName.toLowerCase() === 'picture') {
                const darkSource = parent.querySelector('source[media*="prefers-color-scheme: dark"]');
                if (darkSource) darkSource.remove();
            }
        }
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

function extractFilters(editorial, bookmarks = getBookmarks(), readSet = getReadArticles()) {
    if (!editorial || editorial.length <= 1) return [];
    const tagCounts = new Map();
    editorial.forEach((item) => {
        (item.tags || []).forEach((tag) => {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        });
    });

    const available = [{ id: 'all', label: `All (${editorial.length})` }];
    if (bookmarks.size > 0) {
        available.push({
            id: 'saved',
            label: `★ Saved (${bookmarks.size})`,
        });
    }

    const unreadCount = editorial.filter((item) => !readSet.has(item.id)).length;
    if (readSet.size > 0 && unreadCount > 0) {
        available.push({
            id: 'unread',
            label: `○ Unread (${unreadCount})`,
        });
    }

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
    const isRead = getReadArticles().has(item.id);
    const card = node(document, 'article', `discover-card feed-card ${item.type}-card${isRead ? ' is-read' : ''}`);
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
    metadata.append(node(document, 'span', 'card-read-time', estimateReadingTime(item.title, item.summary)));
    body.append(metadata);

    const href = safeHttps(item.url);
    const title = node(document, 'h3', 'card-title');
    if (href) {
        const titleLink = actionLink(document, href, item.title, 'card-title-link');
        titleLink.addEventListener('click', () => markArticleRead(item.id, document));
        title.append(titleLink);
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
        const utilityGroup = node(document, 'div', 'card-action-utilities');

        const shareBtn = node(document, 'button', 'card-share-btn');
        shareBtn.type = 'button';
        shareBtn.setAttribute('aria-label', 'Copy link to this card');
        shareBtn.title = 'Share or copy link';
        shareBtn.append(shareIcon(document));
        shareBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
                try {
                    await navigator.share({
                        title: item.title,
                        text: item.summary,
                        url: item.url,
                    });
                    showToast('Shared successfully!', 2000, document);
                    return;
                } catch (err) {
                    if (err && err.name === 'AbortError') return;
                }
            }
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
                showToast('Article link copied to clipboard!', 2500, document);
                setTimeout(() => {
                    shareBtn.classList.remove('is-copied');
                    shareBtn.title = 'Share link';
                }, 1800);
            } catch {
                showToast('Article link copied!', 2500, document);
            }
        });
        utilityGroup.append(shareBtn);

        const mdBtn = node(document, 'button', 'card-share-btn card-markdown-btn');
        mdBtn.type = 'button';
        mdBtn.setAttribute('aria-label', 'Copy Markdown link');
        mdBtn.title = 'Copy Markdown link';
        mdBtn.append(markdownIcon(document));
        mdBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                const mdText = `[${item.title}](${item.url}) — via DWithEase Discover`;
                if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(mdText);
                }
                mdBtn.classList.add('is-copied');
                mdBtn.title = 'Copied Markdown!';
                showToast('Markdown link copied to clipboard!', 2500, document);
                setTimeout(() => {
                    mdBtn.classList.remove('is-copied');
                    mdBtn.title = 'Copy Markdown link';
                }, 1800);
            } catch {
                showToast('Markdown link copied!', 2500, document);
            }
        });
        utilityGroup.append(mdBtn);

        const isSaved = getBookmarks().has(item.id);
        const bookmarkBtn = node(document, 'button', `card-share-btn card-bookmark-btn${isSaved ? ' is-bookmarked' : ''}`);
        bookmarkBtn.type = 'button';
        bookmarkBtn.setAttribute('aria-label', isSaved ? 'Remove bookmark' : 'Bookmark this article');
        bookmarkBtn.title = isSaved ? 'Bookmarked' : 'Bookmark';
        bookmarkBtn.dataset.bookmarkId = item.id;
        bookmarkBtn.append(bookmarkIcon(document, isSaved));
        bookmarkBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const current = getBookmarks();
            if (current.has(item.id)) {
                current.delete(item.id);
                bookmarkBtn.classList.remove('is-bookmarked');
                bookmarkBtn.setAttribute('aria-label', 'Bookmark this article');
                bookmarkBtn.title = 'Bookmark';
                bookmarkBtn.replaceChildren(bookmarkIcon(document, false));
                showToast('Bookmark removed', 2000, document);
            } else {
                current.add(item.id);
                bookmarkBtn.classList.add('is-bookmarked');
                bookmarkBtn.setAttribute('aria-label', 'Remove bookmark');
                bookmarkBtn.title = 'Bookmarked';
                bookmarkBtn.replaceChildren(bookmarkIcon(document, true));
                showToast('Article saved to bookmarks!', 2000, document);
            }
            setBookmarks(current);
            notifyBookmarksUpdated(item.id);
        });
        utilityGroup.append(bookmarkBtn);

        actions.append(utilityGroup);
        const cta = actionLink(
            document,
            href,
            item.cta.label,
            item.type === 'promotion' ? 'button' : 'text-link',
        );
        cta.addEventListener('click', () => markArticleRead(item.id, document));
        actions.append(cta);
        body.append(actions);
    }

    card.append(body);
    return card;
}

const boundDocuments = new WeakSet();

export function setupKeyboardNavigation(document, { searchInput, clearBtn, applyFilter } = {}) {
    if (!document || !document.addEventListener) return () => {};
    if (boundDocuments.has(document)) return () => {};
    boundDocuments.add(document);

    let activeIndex = -1;

    function getVisibleCards() {
        return [...document.querySelectorAll('.feed-card')].filter((c) => !c.hidden);
    }

    function highlightCard(index) {
        const visible = getVisibleCards();
        document.querySelectorAll('.feed-card.is-keyboard-active').forEach((c) => {
            c.classList.remove('is-keyboard-active');
        });
        if (index >= 0 && index < visible.length) {
            activeIndex = index;
            const target = visible[index];
            target.classList.add('is-keyboard-active');
            if (target.scrollIntoView) {
                try {
                    target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                } catch {
                    target.scrollIntoView();
                }
            }
            return target;
        }
        activeIndex = -1;
        return null;
    }

    const handler = (e) => {
        const modal = document.getElementById('shortcuts-modal');
        const isModalOpen = modal && !modal.hasAttribute('hidden');

        const activeSearch = searchInput || document.querySelector('.feed-search-input');
        const activeClear = clearBtn || document.querySelector('.search-clear-btn');

        if (e.key === 'Escape') {
            if (isModalOpen) {
                e.preventDefault();
                modal.setAttribute('hidden', '');
                return;
            }
            if (activeSearch && document.activeElement === activeSearch) {
                e.preventDefault();
                activeSearch.value = '';
                if (activeClear) activeClear.hidden = true;
                if (applyFilter) {
                    applyFilter();
                } else if (activeSearch.dispatchEvent) {
                    try {
                        activeSearch.dispatchEvent(new Event('input'));
                    } catch {
                        // ignore
                    }
                }
                activeSearch.blur();
                return;
            }
            if (activeIndex >= 0) {
                highlightCard(-1);
                return;
            }
        }

        const tag = document.activeElement?.tagName;
        const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || Boolean(document.activeElement?.isContentEditable);

        if (isInput) return;

        if (e.key === '/') {
            if (activeSearch) {
                e.preventDefault();
                activeSearch.focus();
            }
            return;
        }

        if (e.key === '?') {
            e.preventDefault();
            toggleShortcutsModal(document);
            return;
        }

        if (isModalOpen) return;

        const visible = getVisibleCards();
        if (!visible.length) return;

        if (e.key === 'j') {
            e.preventDefault();
            const next = activeIndex < visible.length - 1 ? activeIndex + 1 : 0;
            highlightCard(next);
        } else if (e.key === 'k') {
            e.preventDefault();
            const prev = activeIndex <= 0 ? visible.length - 1 : activeIndex - 1;
            highlightCard(prev);
        } else if (e.key === 'b') {
            if (activeIndex >= 0 && visible[activeIndex]) {
                e.preventDefault();
                const bookmarkBtn = visible[activeIndex].querySelector('.card-bookmark-btn');
                if (bookmarkBtn) bookmarkBtn.click();
            }
        } else if (e.key === 'o' || e.key === 'Enter') {
            if (activeIndex >= 0 && visible[activeIndex]) {
                const targetCard = visible[activeIndex];
                const link = targetCard.querySelector('.card-title-link') || targetCard.querySelector('a');
                if (link && link.href) {
                    e.preventDefault();
                    if (targetCard.dataset.itemId) {
                        markArticleRead(targetCard.dataset.itemId, document);
                    }
                    if (typeof window !== 'undefined' && window.open) {
                        window.open(link.href, '_blank', 'noopener,noreferrer');
                    }
                }
            }
        }
    };

    document.addEventListener('keydown', handler);
    return () => {
        boundDocuments.delete(document);
        document.removeEventListener('keydown', handler);
    };
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
    if (getViewPreference() === 'list') {
        grid.classList.add('is-list-view');
    }
    cardEntries.forEach(({ card }) => grid.append(card));

    const emptyNotice = node(document, 'div', 'filter-empty-state');
    emptyNotice.hidden = true;
    const emptyNoticeText = node(document, 'p', 'filter-empty-text', 'No articles match the selected topic.');
    emptyNotice.append(emptyNoticeText);

    if (items.length > 1) {
        const controls = node(document, 'div', 'feed-controls');

        const searchWrapper = node(document, 'div', 'search-wrapper');
        searchWrapper.append(searchIcon(document));

        const searchInput = node(document, 'input', 'feed-search-input');
        searchInput.type = 'search';
        searchInput.placeholder = 'Search articles, topics, sources... (Press /)';
        searchInput.setAttribute('aria-label', 'Search articles');
        searchWrapper.append(searchInput);

        const clearBtn = node(document, 'button', 'search-clear-btn', '×');
        clearBtn.type = 'button';
        clearBtn.setAttribute('aria-label', 'Clear search');
        clearBtn.hidden = true;
        searchWrapper.append(clearBtn);

        const controlsGroup = node(document, 'div', 'feed-controls-group');

        const sourceCounts = new Map();
        items.forEach((item) => {
            const name = item.source?.name;
            if (name) sourceCounts.set(name, (sourceCounts.get(name) || 0) + 1);
        });

        let currentSource = 'all';
        let sourceSelect = null;
        if (sourceCounts.size > 1) {
            sourceSelect = node(document, 'select', 'source-filter-select');
            sourceSelect.setAttribute('aria-label', 'Filter by publication source');
            const allOption = node(document, 'option', '', `All Sources (${items.length})`);
            allOption.value = 'all';
            sourceSelect.append(allOption);
            for (const [sourceName, count] of sourceCounts.entries()) {
                const opt = node(document, 'option', '', `${sourceName} (${count})`);
                opt.value = sourceName;
                sourceSelect.append(opt);
            }
            sourceSelect.addEventListener('change', (e) => {
                currentSource = e.target.value || e.target.options?.[e.target.selectedIndex]?.value || 'all';
                applyFilter();
            });
            controlsGroup.append(sourceSelect);
        }

        const viewToggle = node(document, 'div', 'view-toggle');
        viewToggle.setAttribute('role', 'group');
        viewToggle.setAttribute('aria-label', 'View density');

        const isListActive = getViewPreference() === 'list';
        const gridBtn = node(document, 'button', `view-toggle-btn${!isListActive ? ' is-active' : ''}`, '⊞ Grid');
        gridBtn.type = 'button';
        gridBtn.dataset.view = 'grid';
        gridBtn.setAttribute('aria-pressed', String(!isListActive));
        gridBtn.setAttribute('title', 'Grid view');

        const listBtn = node(document, 'button', `view-toggle-btn${isListActive ? ' is-active' : ''}`, '☰ List');
        listBtn.type = 'button';
        listBtn.dataset.view = 'list';
        listBtn.setAttribute('aria-pressed', String(isListActive));
        listBtn.setAttribute('title', 'Compact list view');

        gridBtn.addEventListener('click', () => {
            grid.classList.remove('is-list-view');
            gridBtn.classList.add('is-active');
            gridBtn.setAttribute('aria-pressed', 'true');
            listBtn.classList.remove('is-active');
            listBtn.setAttribute('aria-pressed', 'false');
            setViewPreference('grid');
        });

        listBtn.addEventListener('click', () => {
            grid.classList.add('is-list-view');
            listBtn.classList.add('is-active');
            listBtn.setAttribute('aria-pressed', 'true');
            gridBtn.classList.remove('is-active');
            gridBtn.setAttribute('aria-pressed', 'false');
            setViewPreference('list');
        });

        viewToggle.append(gridBtn, listBtn);
        controlsGroup.append(viewToggle);

        const exportMenu = node(document, 'div', 'export-menu-wrapper');
        const exportBtn = node(document, 'button', 'export-action-btn', 'Export ▾');
        exportBtn.type = 'button';
        exportBtn.setAttribute('aria-label', 'Export saved reading list or feed subscriptions');
        exportBtn.setAttribute('aria-expanded', 'false');

        const exportDropdown = node(document, 'div', 'export-dropdown');
        exportDropdown.hidden = true;

        const exportMdBtn = node(document, 'button', 'export-dropdown-item', '📄 Reading List (.md)');
        exportMdBtn.type = 'button';
        exportMdBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportDropdown.hidden = true;
            exportBtn.setAttribute('aria-expanded', 'false');
            const bookmarks = getBookmarks();
            const savedItems = items.filter((i) => bookmarks.has(i.id));
            if (savedItems.length === 0) {
                const md = generateMarkdownReadingList(items);
                triggerFileDownload('discover-catalog.md', md, 'text/markdown;charset=utf-8');
                showToast('Exported feed catalog (Tip: Bookmark articles for a custom list)!', 3000, document);
            } else {
                const md = generateMarkdownReadingList(savedItems);
                triggerFileDownload('discover-reading-list.md', md, 'text/markdown;charset=utf-8');
                showToast(`Exported ${savedItems.length} saved article(s) to Markdown!`, 2500, document);
            }
        });
        exportDropdown.append(exportMdBtn);

        const exportOpmlBtn = node(document, 'button', 'export-dropdown-item', '📡 Feed Readers (.opml)');
        exportOpmlBtn.type = 'button';
        exportOpmlBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportDropdown.hidden = true;
            exportBtn.setAttribute('aria-expanded', 'false');
            const opml = generateOpml();
            triggerFileDownload('dwithease-discover.opml', opml, 'text/xml;charset=utf-8');
            showToast('Exported OPML feed subscriptions!', 2500, document);
        });
        exportDropdown.append(exportOpmlBtn);

        exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = !exportDropdown.hidden;
            exportDropdown.hidden = isOpen;
            exportBtn.setAttribute('aria-expanded', String(!isOpen));
        });

        document.addEventListener('click', () => {
            if (!exportDropdown.hidden) {
                exportDropdown.hidden = true;
                exportBtn.setAttribute('aria-expanded', 'false');
            }
        });

        exportMenu.append(exportBtn, exportDropdown);
        controlsGroup.append(exportMenu);
        controls.append(searchWrapper, controlsGroup);
        wrapper.append(controls);

        const bar = node(document, 'div', 'filter-bar');
        bar.setAttribute('role', 'toolbar');
        bar.setAttribute('aria-label', 'Filter articles by topic');

        let currentFilter = 'all';
        let currentQuery = '';

        const applyFilter = (filterId) => {
            if (filterId !== undefined) {
                currentFilter = filterId;
            }
            bar.querySelectorAll('.filter-pill').forEach((btn) => {
                const isActive = btn.dataset.filter === currentFilter;
                btn.classList.toggle('is-active', isActive);
                btn.setAttribute('aria-pressed', String(isActive));
            });

            const query = currentQuery.toLowerCase().trim();
            const bookmarks = getBookmarks();
            const readSet = getReadArticles();
            let visibleCount = 0;

            cardEntries.forEach(({ item, card }) => {
                let topicMatch = false;
                if (currentFilter === 'all') {
                    topicMatch = true;
                } else if (currentFilter === 'saved') {
                    topicMatch = bookmarks.has(item.id);
                } else if (currentFilter === 'unread') {
                    topicMatch = !readSet.has(item.id);
                } else {
                    topicMatch = item.tags?.includes(currentFilter);
                }

                let sourceMatch = true;
                if (currentSource !== 'all') {
                    sourceMatch = item.source?.name === currentSource;
                }

                let queryMatch = true;
                if (query) {
                    const haystack = `${item.title} ${item.summary} ${item.source.name} ${(item.tags || []).join(' ')}`.toLowerCase();
                    queryMatch = haystack.includes(query);
                }

                const matches = topicMatch && sourceMatch && queryMatch;
                card.hidden = !matches;
                if (matches) visibleCount += 1;
            });

            emptyNotice.hidden = visibleCount > 0;
            if (!emptyNotice.hidden) {
                if (query) {
                    emptyNoticeText.textContent = `No articles match "${searchInput.value}".`;
                } else if (currentFilter === 'saved') {
                    emptyNoticeText.textContent = 'No saved articles yet. Bookmark articles to read them later.';
                } else if (currentFilter === 'unread') {
                    emptyNoticeText.textContent = 'All caught up! No unread articles.';
                } else if (currentSource !== 'all') {
                    emptyNoticeText.textContent = `No articles from "${currentSource}" match the selected filters.`;
                } else {
                    emptyNoticeText.textContent = 'No articles match the selected topic.';
                }
            }
        };

        const resetBtn = node(document, 'button', 'filter-reset-btn', 'Show all articles');
        resetBtn.type = 'button';
        resetBtn.addEventListener('click', () => {
            searchInput.value = '';
            currentQuery = '';
            clearBtn.hidden = true;
            if (sourceSelect) {
                sourceSelect.selectedIndex = 0;
                try { sourceSelect.value = 'all'; } catch { /* ignore */ }
            }
            currentSource = 'all';
            applyFilter('all');
        });
        emptyNotice.append(resetBtn);

        searchInput.addEventListener('input', (e) => {
            currentQuery = (e.target.value || '').trim();
            clearBtn.hidden = !currentQuery;
            applyFilter();
        });

        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            currentQuery = '';
            clearBtn.hidden = true;
            applyFilter();
            searchInput.focus();
        });

        setupKeyboardNavigation(document, { searchInput, clearBtn, applyFilter });

        const filters = extractFilters(items, getBookmarks(), getReadArticles());
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
                if (filters.some((f) => f.id === tagId) || TOPIC_PRESETS.some((f) => f.id === tagId)) {
                    tagSpan.classList.add('interactive-tag');
                    tagSpan.title = `Filter by #${tagId}`;
                    tagSpan.addEventListener('click', () => applyFilter(tagId));
                }
            });
        });

        const updateSavedPill = () => {
            const savedCount = getBookmarks().size;
            let savedPill = bar.querySelector('[data-filter="saved"]');
            if (savedCount > 0) {
                if (!savedPill) {
                    savedPill = node(document, 'button', 'filter-pill', `★ Saved (${savedCount})`);
                    savedPill.type = 'button';
                    savedPill.dataset.filter = 'saved';
                    savedPill.setAttribute('aria-pressed', String(currentFilter === 'saved'));
                    savedPill.addEventListener('click', () => applyFilter('saved'));
                    const allPill = bar.querySelector('[data-filter="all"]');
                    if (allPill && allPill.nextSibling) {
                        bar.insertBefore(savedPill, allPill.nextSibling);
                    } else {
                        bar.append(savedPill);
                    }
                } else {
                    savedPill.textContent = `★ Saved (${savedCount})`;
                }
            } else if (savedPill) {
                if (currentFilter === 'saved') currentFilter = 'all';
                savedPill.remove();
                applyFilter();
            }
        };

        const updateUnreadPill = () => {
            const readSet = getReadArticles();
            const unreadCount = items.filter((item) => !readSet.has(item.id)).length;
            let unreadPill = bar.querySelector('[data-filter="unread"]');
            if (readSet.size > 0 && unreadCount > 0) {
                if (!unreadPill) {
                    unreadPill = node(document, 'button', 'filter-pill', `○ Unread (${unreadCount})`);
                    unreadPill.type = 'button';
                    unreadPill.dataset.filter = 'unread';
                    unreadPill.setAttribute('aria-pressed', String(currentFilter === 'unread'));
                    unreadPill.addEventListener('click', () => applyFilter('unread'));
                    const savedPill = bar.querySelector('[data-filter="saved"]');
                    if (savedPill && savedPill.nextSibling) {
                        bar.insertBefore(unreadPill, savedPill.nextSibling);
                    } else {
                        const allPill = bar.querySelector('[data-filter="all"]');
                        if (allPill && allPill.nextSibling) {
                            bar.insertBefore(unreadPill, allPill.nextSibling);
                        } else {
                            bar.append(unreadPill);
                        }
                    }
                } else {
                    unreadPill.textContent = `○ Unread (${unreadCount})`;
                }
            } else if (unreadPill) {
                if (currentFilter === 'unread') currentFilter = 'all';
                unreadPill.remove();
                applyFilter();
            }
        };

        onBookmarksUpdated(() => {
            updateSavedPill();
            if (currentFilter === 'saved') applyFilter();
        });

        onReadUpdated(() => {
            updateUnreadPill();
            if (currentFilter === 'unread') applyFilter();
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

    const doc = root.ownerDocument;
    applyTheme(getThemePreference(), doc);
    const themeMount = doc.getElementById('theme-switcher-mount');
    if (themeMount && !themeMount.firstElementChild) {
        themeMount.append(themeSwitcher(doc));
    }

    const shortcutsBtn = doc.getElementById('shortcuts-btn');
    if (shortcutsBtn && !shortcutsBtn.dataset.bound) {
        shortcutsBtn.dataset.bound = 'true';
        shortcutsBtn.addEventListener('click', () => toggleShortcutsModal(doc));
    }
    const subscribeBtn = doc.getElementById('subscribe-feed-btn');
    if (subscribeBtn && !subscribeBtn.dataset.bound) {
        subscribeBtn.dataset.bound = 'true';
        subscribeBtn.addEventListener('click', () => toggleSubscribeModal(doc, pageUrl));
    }
    setupKeyboardNavigation(doc);

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
    applyTheme(getThemePreference(), document);
    const themeMount = document.getElementById('theme-switcher-mount');
    if (themeMount && !themeMount.firstElementChild) {
        themeMount.append(themeSwitcher(document));
    }
    const shortcutsBtn = document.getElementById('shortcuts-btn');
    if (shortcutsBtn && !shortcutsBtn.dataset.bound) {
        shortcutsBtn.dataset.bound = 'true';
        shortcutsBtn.addEventListener('click', () => toggleShortcutsModal(document));
    }
    const subscribeBtn = document.getElementById('subscribe-feed-btn');
    if (subscribeBtn && !subscribeBtn.dataset.bound) {
        subscribeBtn.dataset.bound = 'true';
        subscribeBtn.addEventListener('click', () => toggleSubscribeModal(document));
    }
    const root = document.getElementById('discover-content');
    if (root) startDiscoverPage({ root, search: window.location.search });
}
