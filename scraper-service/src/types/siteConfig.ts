export interface SiteConfig {
    name: string;
    url: string;

    /** CSS selector that indicates the page has fully loaded (eg., 'nav','sidebar') */
    readySelector: string;

    /** CSS selectors for nav link extraction; defaults apply when omitted */
    navSelectors?: string[];

    /** Query live DOM + shadow roots for nav links (default true) */
    pierceShadowDom?: boolean;

    respectRobotsTxt?: boolean;
    maxRequestsPerRun?: number;
}