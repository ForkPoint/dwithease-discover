const PRODUCT_CATEGORIES = new Set(['e-commerce', 'web-development']);
const PRODUCT_PLACEMENTS = new Set(['discover', 'task-end', 'popup']);
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const IMAGE_TYPES = new Set(['gif', 'jpeg', 'jpg', 'png', 'svg', 'webp']);

function requiredText(value, maxLength) {
    return typeof value === 'string'
        && value.trim().length > 0
        && value.length <= maxLength;
}

function safeId(value) {
    return requiredText(value, 120) && !RESERVED_KEYS.has(value);
}

function utcDate(value) {
    return typeof value === 'string'
        && value.endsWith('Z')
        && Number.isFinite(Date.parse(value));
}

function httpsUrl(value) {
    try {
        return new URL(value).protocol === 'https:';
    } catch {
        return false;
    }
}

function validProduct(item) {
    if (!item || item.kind !== 'product') return false;
    if (!safeId(item.id) || !safeId(item.productId)) return false;
    if (!requiredText(item.name, 60)) return false;
    if (!requiredText(item.benefit, 160)) return false;
    if (!requiredText(item.ctaLabel, 24)) return false;
    if (!PRODUCT_CATEGORIES.has(item.category)) return false;
    if (!utcDate(item.startsAt) || !utcDate(item.endsAt)) return false;
    if (Date.parse(item.endsAt) <= Date.parse(item.startsAt)) return false;
    if (!httpsUrl(item.url)) return false;
    if (!Array.isArray(item.placements) || item.placements.length === 0) return false;
    if (item.placements.some((placement) => !PRODUCT_PLACEMENTS.has(placement))) return false;
    return item.imageId === undefined || typeof item.imageId === 'string';
}

function validV2Item(item) {
    if (!item || !safeId(item.id)) return false;
    if (!['article', 'news', 'promotion'].includes(item.type)) return false;
    if (!requiredText(item.title, 120) || !requiredText(item.summary, 280)) return false;
    if (!httpsUrl(item.url) || !utcDate(item.publishedAt)) return false;
    if (!requiredText(item.source?.name, 80) || !httpsUrl(item.source?.url)) return false;
    if (!requiredText(item.cta?.label, 32)) return false;
    if (!Array.isArray(item.tags) || item.tags.length === 0 || item.tags.length > 8) return false;
    return item.tags.every((tag) => safeId(tag));
}

function validV2Promotion(item) {
    const campaign = item?.campaign;
    if (!validV2Item(item) || item.type !== 'promotion' || !campaign) return false;
    if (!safeId(campaign.id)) return false;
    if (!utcDate(campaign.startsAt) || !utcDate(campaign.endsAt)) return false;
    if (Date.parse(campaign.endsAt) <= Date.parse(campaign.startsAt)) return false;
    if (!Array.isArray(campaign.placements) || campaign.placements.length === 0) return false;
    return campaign.placements.every((placement) => PRODUCT_PLACEMENTS.has(placement));
}

export function selectFeedName(search = '') {
    return new URLSearchParams(search).get('feed') === 'dev' ? 'dev' : 'live';
}

export function buildCatalog(raw, now = Date.now()) {
    if (raw?.version === 2 && Array.isArray(raw.items)) {
        const promotions = raw.items.filter((item) => validV2Promotion(item)
            && item.campaign.placements.includes('discover')
            && Date.parse(item.campaign.startsAt) <= now
            && now < Date.parse(item.campaign.endsAt));
        const editorial = raw.items.filter((item) => validV2Item(item)
            && (item.type === 'article' || item.type === 'news'))
            .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));

        return { promotions, editorial };
    }

    const messages = Array.isArray(raw?.messages) ? raw.messages : [];
    const activeProducts = messages.filter((item) => validProduct(item)
        && item.placements.includes('discover')
        && Date.parse(item.startsAt) <= now
        && now < Date.parse(item.endsAt));

    return {
        ecommerce: activeProducts.filter((item) => item.category === 'e-commerce'),
        webDevelopment: activeProducts.filter((item) => item.category === 'web-development'),
        updates: messages.filter((item) => item && item.kind !== 'product'),
    };
}

export function createImageMap(raw) {
    const images = Object.create(null);

    if (!Array.isArray(raw?.images)) return images;

    raw.images.forEach((image) => {
        if (!safeId(image?.name) || !IMAGE_TYPES.has(image?.type)) return;
        if (typeof image.data !== 'string' || image.data.length === 0) return;

        const type = image.type === 'jpg'
            ? 'jpeg'
            : image.type === 'svg' ? 'svg+xml' : image.type;
        images[image.name] = `data:image/${type};base64,${image.data}`;
    });

    return images;
}
