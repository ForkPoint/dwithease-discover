const PRODUCT_PLACEMENTS = new Set(['discover', 'task-end', 'popup']);
const STRICT_END = '(?![\\s\\S])';
const SLUG_PATTERN = new RegExp(`^[a-z0-9]+(?:-[a-z0-9]+)*${STRICT_END}`);
const LOCALE_PATTERN = new RegExp(`^[a-z]{2}(?:-[A-Z]{2})?${STRICT_END}`);
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
    if (!image || !limitedText(image.alt, 160)) return false;
    return isHttpsUrl(image.src)
        || (typeof image.src === 'string' && image.src.startsWith('assets/'));
}

function validV2Item(item) {
    if (!item || !safeId(item.id)) return false;
    if (!['article', 'news', 'promotion'].includes(item.type)) return false;
    if (!requiredText(item.title, 120) || !requiredText(item.summary, 280)) return false;
    if (!isHttpsUrl(item.url) || !dateTime(item.publishedAt)) return false;
    if (!requiredText(item.source?.name, 80) || !isHttpsUrl(item.source?.url)) return false;
    if (!requiredText(item.cta?.label, 32)) return false;
    if (!Array.isArray(item.tags) || item.tags.length === 0 || item.tags.length > 8) return false;
    return item.tags.every((tag) => safeId(tag)) && validImage(item.image);
}

function validV2Promotion(item) {
    const campaign = item?.campaign;
    if (!validV2Item(item) || item.type !== 'promotion' || !campaign) return false;
    if (!safeId(campaign.id)) return false;
    if (!dateTime(campaign.startsAt) || !dateTime(campaign.endsAt)) return false;
    if (Date.parse(campaign.endsAt) <= Date.parse(campaign.startsAt)) return false;
    if (!Array.isArray(campaign.placements) || campaign.placements.length === 0) return false;
    return campaign.placements.every((placement) => PRODUCT_PLACEMENTS.has(placement));
}

export function selectFeedName(search = '') {
    return new URLSearchParams(search).get('feed') === 'dev' ? 'dev' : 'live';
}

export function buildCatalog(raw, now = Date.now()) {
    const items = raw?.version === 2
        && typeof raw.locale === 'string'
        && LOCALE_PATTERN.test(raw.locale)
        && Array.isArray(raw.items)
        ? raw.items
        : [];
    const promotions = items.filter((item) => validV2Promotion(item)
        && item.campaign.placements.includes('discover')
        && Date.parse(item.campaign.startsAt) <= now
        && now < Date.parse(item.campaign.endsAt));
    const editorial = items.filter((item) => validV2Item(item)
        && (item.type === 'article' || item.type === 'news'))
        .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));

    return { promotions, editorial };
}
