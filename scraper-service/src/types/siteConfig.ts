export interface SiteConfig {
    name: string;
    url: string;

    /** CSS selector that indicates the page has fully loaded (eg., 'nav','sidebar') */
    readySelector: string;

    respectRobotsTxt?: boolean;
    maxRequestsPerRun?: number;
}