declare module "google-play-scraper" {
  export interface AppOptions {
    appId: string;
    lang?: string;
    country?: string;
  }

  export interface AppResult {
    title?: string;
    summary?: string;
    description?: string;
    recentChanges?: string;
    version?: string;
    updated?: string;
    url?: string;
  }

  const gplay: {
    app: (opts: AppOptions) => Promise<AppResult>;
  };

  export default gplay;
}

declare module "app-store-scraper" {
  export interface AppOptions {
    id?: number;
    appId?: string;
    country?: string;
    lang?: string;
  }

  export interface AppResult {
    title?: string;
    description?: string;
    releaseNotes?: string;
    version?: string;
    currentVersionReleaseDate?: string;
    url?: string;
  }

  const store: {
    app: (opts: AppOptions) => Promise<AppResult>;
  };

  export default store;
}
