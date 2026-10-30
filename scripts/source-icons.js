import sources from '../sources.json' with { type: 'json' };

const iconBase = 'https://discover.dwithease.com/';
const icons = new Map(sources.sources.map((source) => [source.url, source.icon]));

/** Include a public icon URL in each item so feed consumers need no source registry. */
export function withSourceIcon(item) {
    return {
        ...item,
        source: {
            ...item.source,
            icon: new URL(icons.get(item.source.url) ?? 'assets/sources/source-fallback.svg', iconBase).href,
        },
    };
}
