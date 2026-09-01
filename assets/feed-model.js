const PRODUCT_PLACEMENTS = new Set(['discover', 'task-end', 'popup']);
const STRICT_END = '(?![\\s\\S])';
const SLUG_PATTERN = new RegExp(`^[a-z0-9]+(?:-[a-z0-9]+)*${STRICT_END}`);
const LOCALE_PATTERN = new RegExp(`^[a-z]{2}(?:-[A-Z]{2})?${STRICT_END}`);
const DATE_TIME_PATTERN = new RegExp('^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29'
    + '|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))'
    + 'T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))'
    + STRICT_END);
const RFC3986_PERCENT_ENCODED = '%[0-9A-Fa-f]{2}';
const DNS_LABEL = '(?![Xx][Nn]--)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?';
const DNS_NAME = `(?![0-9]+(?:\\.[0-9]+)*\\.?(?=[:/?#]|${STRICT_END}))${DNS_LABEL}(?:\\.${DNS_LABEL})*\\.?`;
const IPV4_DECIMAL_OCTET = '(?:[0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])';
const IPV4_ADDRESS = `(?:${IPV4_DECIMAL_OCTET}\\.){3}${IPV4_DECIMAL_OCTET}`;
const IPV6_HEXTET = '[0-9A-Fa-f]{1,4}';
const IPV6_LOW_32_BITS = `(?:${IPV6_HEXTET}:${IPV6_HEXTET}|${IPV4_ADDRESS})`;
const IPV6_ADDRESS = `(?:(?:${IPV6_HEXTET}:){6}${IPV6_LOW_32_BITS}`
    + `|::(?:${IPV6_HEXTET}:){5}${IPV6_LOW_32_BITS}`
    + `|(?:${IPV6_HEXTET})?::(?:${IPV6_HEXTET}:){4}${IPV6_LOW_32_BITS}`
    + `|(?:(?:${IPV6_HEXTET}:){0,1}${IPV6_HEXTET})?::(?:${IPV6_HEXTET}:){3}${IPV6_LOW_32_BITS}`
    + `|(?:(?:${IPV6_HEXTET}:){0,2}${IPV6_HEXTET})?::(?:${IPV6_HEXTET}:){2}${IPV6_LOW_32_BITS}`
    + `|(?:(?:${IPV6_HEXTET}:){0,3}${IPV6_HEXTET})?::${IPV6_HEXTET}:${IPV6_LOW_32_BITS}`
    + `|(?:(?:${IPV6_HEXTET}:){0,4}${IPV6_HEXTET})?::${IPV6_LOW_32_BITS}`
    + `|(?:(?:${IPV6_HEXTET}:){0,5}${IPV6_HEXTET})?::${IPV6_HEXTET}`
    + `|(?:(?:${IPV6_HEXTET}:){0,6}${IPV6_HEXTET})?::)`;
const RFC3986_HOST = `(?:${IPV4_ADDRESS}|\\[${IPV6_ADDRESS}\\]|${DNS_NAME})`;
const RFC3986_PORT = '(?:[0-9]{1,4}|[0-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])';
const RFC3986_AUTHORITY = `${RFC3986_HOST}(?::${RFC3986_PORT})?`;
const RFC3986_PATH_CHARACTER = "[A-Za-z0-9._~!$&'()*+,;=:@-]";
const RFC3986_QUERY_CHARACTER = "[A-Za-z0-9._~!$&'()*+,;=:@/?-]";
const RFC3986_HTTPS_PATTERN = new RegExp(`^https://${RFC3986_AUTHORITY}`
    + `(?:/(?:${RFC3986_PATH_CHARACTER}|${RFC3986_PERCENT_ENCODED})*)*`
    + `(?:\\?(?:${RFC3986_QUERY_CHARACTER}|${RFC3986_PERCENT_ENCODED})*)?`
    + `(?:#(?:${RFC3986_QUERY_CHARACTER}|${RFC3986_PERCENT_ENCODED})*)?${STRICT_END}`);
const SOURCE_ICON_PATTERN = /^assets\/sources\/[a-z0-9]+(?:-[a-z0-9]+)*\.(?:ico|png|svg|webp)$/;

function exactObject(value, requiredKeys, optionalKeys = []) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
    const keys = Object.keys(value);
    return requiredKeys.every((key) => Object.hasOwn(value, key))
        && keys.every((key) => allowedKeys.has(key));
}

function limitedText(value, maxLength) {
    return typeof value === 'string' && [...value].length <= maxLength;
}

function requiredText(value, maxLength) {
    return limitedText(value, maxLength) && value.trim().length > 0;
}

function safeId(value) {
    return limitedText(value, 120) && SLUG_PATTERN.test(value);
}

function dateTime(value) {
    return typeof value === 'string'
        && DATE_TIME_PATTERN.test(value)
        && Number.isFinite(Date.parse(value));
}

export function isHttpsUrl(value) {
    if (typeof value !== 'string' || !RFC3986_HTTPS_PATTERN.test(value)) return false;
    try {
        return new URL(value).protocol === 'https:';
    } catch {
        return false;
    }
}

function validImage(image) {
    if (image === undefined) return true;
    if (!exactObject(image, ['src', 'alt']) || !limitedText(image.alt, 160)) return false;
    return isHttpsUrl(image.src)
        || (typeof image.src === 'string' && image.src.startsWith('assets/'));
}

function validFeedItem(item) {
    if (!item || !['article', 'news', 'promotion'].includes(item.type)) return false;
    const requiredKeys = [
        'id',
        'type',
        'title',
        'summary',
        'url',
        'source',
        'publishedAt',
        'tags',
        'cta',
    ];
    if (item.type === 'promotion') requiredKeys.push('campaign');
    if (!exactObject(item, requiredKeys, ['image']) || !safeId(item.id)) return false;
    if (!requiredText(item.title, 120) || !requiredText(item.summary, 280)) return false;
    if (!isHttpsUrl(item.url) || !dateTime(item.publishedAt)) return false;
    if (!exactObject(item.source, ['name', 'url'])) return false;
    if (!requiredText(item.source.name, 80) || !isHttpsUrl(item.source.url)) return false;
    if (!exactObject(item.cta, ['label']) || !requiredText(item.cta.label, 32)) return false;
    if (!Array.isArray(item.tags) || item.tags.length === 0 || item.tags.length > 8) return false;
    if (!item.tags.every((tag) => safeId(tag)) || new Set(item.tags).size !== item.tags.length) return false;
    if (!validImage(item.image)) return false;
    if (item.type !== 'promotion') return true;

    const { campaign } = item;
    if (!exactObject(campaign, ['id', 'startsAt', 'endsAt', 'placements'])) return false;
    if (!safeId(campaign.id)) return false;
    if (!dateTime(campaign.startsAt) || !dateTime(campaign.endsAt)) return false;
    if (Date.parse(campaign.endsAt) <= Date.parse(campaign.startsAt)) return false;
    if (!Array.isArray(campaign.placements)
        || campaign.placements.length === 0
        || campaign.placements.length > 3) return false;
    return campaign.placements.every((placement) => PRODUCT_PLACEMENTS.has(placement));
}

function validFeed(raw) {
    if (!exactObject(raw, ['locale', 'updatedAt', 'items'])) return false;
    if (typeof raw.locale !== 'string'
        || !LOCALE_PATTERN.test(raw.locale)
        || !dateTime(raw.updatedAt)) return false;
    if (!Array.isArray(raw.items) || !raw.items.every((item) => validFeedItem(item))) return false;
    return new Set(raw.items.map(({ id }) => id)).size === raw.items.length;
}

export function buildSourceRegistry(raw, registryUrl, pageUrl = registryUrl) {
    if (!exactObject(raw, ['sources']) || !Array.isArray(raw.sources)) {
        throw new TypeError('Invalid source registry');
    }

    const pageAddress = new URL(pageUrl);
    const registryAddress = new URL(registryUrl, pageAddress);
    if (!['http:', 'https:'].includes(pageAddress.protocol)
        || registryAddress.origin !== pageAddress.origin) {
        throw new TypeError('Source registry must use the page origin');
    }

    const sources = new Map();
    for (const source of raw.sources) {
        if (!exactObject(source, ['name', 'url', 'icon'])
            || !requiredText(source.name, 80)
            || !isHttpsUrl(source.url)
            || typeof source.icon !== 'string'
            || !SOURCE_ICON_PATTERN.test(source.icon)
            || sources.has(source.url)) {
            throw new TypeError('Invalid source registry entry');
        }

        const icon = new URL(source.icon, registryAddress);
        if (icon.origin !== pageAddress.origin) {
            throw new TypeError('Source icon must use the page origin');
        }
        sources.set(source.url, { ...source, icon: icon.href });
    }

    return sources;
}

export function selectFeedName(search = '') {
    return new URLSearchParams(search).get('feed') === 'dev' ? 'dev' : 'live';
}

export function buildCatalog(raw, now = Date.now()) {
    const items = validFeed(raw) ? raw.items : [];
    const promotions = items.filter((item) => item.type === 'promotion'
        && item.campaign.placements.includes('discover')
        && Date.parse(item.campaign.startsAt) <= now
        && now < Date.parse(item.campaign.endsAt));
    const editorial = items.filter((item) => item.type === 'article' || item.type === 'news')
        .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));

    return { promotions, editorial };
}
