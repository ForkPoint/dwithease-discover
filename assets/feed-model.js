const PRODUCT_PLACEMENTS = new Set(['discover', 'task-end', 'popup']);
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function requiredText(value, maxLength) {
    return typeof value === 'string'
        && value.trim().length > 0
        && value.length <= maxLength;
}

function safeId(value) {
    return requiredText(value, 120) && !RESERVED_KEYS.has(value);
}

function dateTime(value) {
    return typeof value === 'string'
        && Number.isFinite(Date.parse(value));
}

function httpsUrl(value) {
    try {
        return new URL(value).protocol === 'https:';
    } catch {
        return false;
    }
}

function validV2Item(item) {
    if (!item || !safeId(item.id)) return false;
    if (!['article', 'news', 'promotion'].includes(item.type)) return false;
    if (!requiredText(item.title, 120) || !requiredText(item.summary, 280)) return false;
    if (!httpsUrl(item.url) || !dateTime(item.publishedAt)) return false;
    if (!requiredText(item.source?.name, 80) || !httpsUrl(item.source?.url)) return false;
    if (!requiredText(item.cta?.label, 32)) return false;
    if (!Array.isArray(item.tags) || item.tags.length === 0 || item.tags.length > 8) return false;
    return item.tags.every((tag) => safeId(tag));
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
    const items = raw?.version === 2 && Array.isArray(raw.items) ? raw.items : [];
    const promotions = items.filter((item) => validV2Promotion(item)
        && item.campaign.placements.includes('discover')
        && Date.parse(item.campaign.startsAt) <= now
        && now < Date.parse(item.campaign.endsAt));
    const editorial = items.filter((item) => validV2Item(item)
        && (item.type === 'article' || item.type === 'news'))
        .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));

    return { promotions, editorial };
}
