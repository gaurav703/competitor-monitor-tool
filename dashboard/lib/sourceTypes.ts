export const SOURCE_TYPES = ["playstore", "appstore", "blog_rss", "website", "news", "reddit"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
