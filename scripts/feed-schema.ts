import { z } from 'zod';

const SlugSchema = z.string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const RFC3986_PERCENT_ENCODED = '%[0-9A-Fa-f]{2}';
const RFC3986_REG_NAME_CHARACTER = "[A-Za-z0-9._~!$&'()*+,;=-]";
const RFC3986_IP_LITERAL = "\\[(?:[A-Fa-f0-9:.]+|[vV][0-9A-Fa-f]+\\.[A-Za-z0-9._~!$&'()*+,;=:-]+)\\]";
const RFC3986_HOST = `(?:(?:${RFC3986_REG_NAME_CHARACTER}|${RFC3986_PERCENT_ENCODED})+|${RFC3986_IP_LITERAL})`;
const RFC3986_PORT = '(?:[0-9]{1,4}|[0-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])';
const RFC3986_AUTHORITY = `${RFC3986_HOST}(?::${RFC3986_PORT})?`;
const RFC3986_PATH_CHARACTER = "[A-Za-z0-9._~!$&'()*+,;=:@-]";
const RFC3986_QUERY_CHARACTER = "[A-Za-z0-9._~!$&'()*+,;=:@/?-]";
const HTTPS_URL_PATTERN = `^https://${RFC3986_AUTHORITY}`
    + `(?:/(?:${RFC3986_PATH_CHARACTER}|${RFC3986_PERCENT_ENCODED})*)*`
    + `(?:\\?(?:${RFC3986_QUERY_CHARACTER}|${RFC3986_PERCENT_ENCODED})*)?`
    + `(?:#(?:${RFC3986_QUERY_CHARACTER}|${RFC3986_PERCENT_ENCODED})*)?$`;

const HttpsUrlSchema = z.string()
    .regex(new RegExp(HTTPS_URL_PATTERN))
    .pipe(z.url({ protocol: /^https$/ }))
    .meta({ pattern: HTTPS_URL_PATTERN });

const DateTimeSchema = z.iso.datetime({ offset: true });

const TagsSchema = z.array(SlugSchema)
    .min(1)
    .max(8)
    .refine((tags) => new Set(tags).size === tags.length, {
        message: 'Tags must be unique',
    })
    .meta({ uniqueItems: true });

const SourceSchema = z.strictObject({
    name: z.string().max(80).regex(/\S/).trim().min(1),
    url: HttpsUrlSchema,
});

const ImageSchema = z.strictObject({
    src: z.union([
        HttpsUrlSchema,
        z.string().regex(/^assets\//),
    ]),
    alt: z.string().max(160).trim(),
});

const CtaSchema = z.strictObject({
    label: z.string().max(32).regex(/\S/).trim().min(1),
});

const CommonItemShape = {
    id: SlugSchema,
    title: z.string().max(120).regex(/\S/).trim().min(1),
    summary: z.string().max(280).regex(/\S/).trim().min(1),
    url: HttpsUrlSchema,
    source: SourceSchema,
    publishedAt: DateTimeSchema,
    tags: TagsSchema,
    image: ImageSchema.optional(),
    cta: CtaSchema,
};

const EditorialItemSchema = z.strictObject({
    ...CommonItemShape,
    type: z.enum(['article', 'news']),
});

const CampaignSchema = z.strictObject({
    id: SlugSchema,
    startsAt: DateTimeSchema,
    endsAt: DateTimeSchema,
    placements: z.array(z.enum(['discover', 'task-end', 'popup'])).min(1).max(3),
}).superRefine((campaign, context) => {
    if (Date.parse(campaign.endsAt) <= Date.parse(campaign.startsAt)) {
        context.addIssue({
            code: 'custom',
            path: ['endsAt'],
            message: 'Campaign end must be after its start',
        });
    }
});

const PromotionItemSchema = z.strictObject({
    ...CommonItemShape,
    type: z.literal('promotion'),
    campaign: CampaignSchema,
});

export const FeedItemSchema = z.discriminatedUnion('type', [
    EditorialItemSchema,
    PromotionItemSchema,
]);

export const FeedSchema = z.strictObject({
    version: z.literal(2),
    locale: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
    updatedAt: DateTimeSchema,
    items: z.array(FeedItemSchema),
}).superRefine((feed, context) => {
    const itemIds = new Set<string>();

    feed.items.forEach((item, index) => {
        if (itemIds.has(item.id)) {
            context.addIssue({
                code: 'custom',
                path: ['items', index, 'id'],
                message: `Duplicate item ID: ${item.id}`,
            });
        }
        itemIds.add(item.id);
    });
});

export type Feed = z.infer<typeof FeedSchema>;
export type FeedItem = z.infer<typeof FeedItemSchema>;

export type FeedValidationResult =
    | { success: true; data: Feed }
    | { success: false; errors: Array<{ path: string; message: string }> };

export function validateFeed(input: unknown): FeedValidationResult {
    const result = FeedSchema.safeParse(input);

    if (result.success) {
        return { success: true, data: result.data };
    }

    return {
        success: false,
        errors: result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
        })),
    };
}
