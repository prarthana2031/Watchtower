import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { log, logError } from '../utils/logger.js';
import { DEFAULT_NAV_SELECTORS } from '../differ/structural.js';
import { extractNavLinksFromPage } from './shadowNav.js';


const NAVIGATION_TIMEOUT_MS = 30_000;
const SELECTOR_TIMEOUT_MS = 10_000;
const NETWORK_IDLE_TIMEOUT_MS = 15_000;

let sharedBrowser: Browser | null = null; //the live browser instance (or null if none)
let browserLaunch: Promise<Browser> | null = null; //if two sites start at once, they share the same launch promise instead of starting two browsers

 /**
 * A browser instance is the "container" process that runs the browser, holding all your tabs, windows, and session data together.
 */
export async function getBrowser(): Promise<Browser> {
  if (sharedBrowser?.isConnected()) {
    return sharedBrowser;
  }
  /*isConnected() is a method on Playwright’s Browser object.
   It returns a boolean*/

  sharedBrowser = null;

  if (!browserLaunch) { //If a browser is not currently being launched
    browserLaunch = chromium
      .launch({ headless: true })
      .then(  (browser) => {
        sharedBrowser = browser;
        return browser;
      })
      .finally(() => {
        browserLaunch = null;
      });
  }

  return browserLaunch;
}

export async function closeBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
    log('Browser closed.');
  }
}

/**
 * Takes a screenshot of the given URL, saves it to the provided path, and returns the page HTML.
 * Returns success plus the captured HTML content.
 */
export async function takeScreenshot(
  url: string,
  readySelector: string,
  screenshotPath: string,
  options: {
    navSelectors?: readonly string[];
    pierceShadowDom?: boolean;
  } = {}
): Promise<{
  success: boolean;
  html: string | null;
  screenshotPath: string;
  navLinksFromPage: string[];
}> {
  const navSelectors = options.navSelectors ?? DEFAULT_NAV_SELECTORS;
  const pierceShadowDom = options.pierceShadowDom ?? true;
  let context: BrowserContext | null = null;
  try {
    log(`Opening page for ${url}`);
    const browser = await getBrowser();
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page: Page = await context.newPage();

    log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });

    if (readySelector) {
      log(`Waiting for selector "${readySelector}"`);
      try {
        await page.waitForSelector(readySelector, { timeout: SELECTOR_TIMEOUT_MS });
      } catch (error) {
        logError(
          `Selector "${readySelector}" did not appear within ${SELECTOR_TIMEOUT_MS / 1000}s; attempting a fallback wait`,
          error
        );
        try {
          await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS });
        } catch (loadError) {
          logError('Fallback network idle wait failed; continuing with screenshot anyway', loadError);
        }
      }
    } else {
      log('No ready selector configured; attempting to wait for network idle');
      try {
        await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS });
      } catch (error) {
        logError('Network idle wait failed; continuing with screenshot anyway', error);
      }
    }

    log(`Taking screenshot -> ${screenshotPath}`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    log('Retrieving HTML content.');
    const html = await page.content();

    let navLinksFromPage: string[] = [];
    if (pierceShadowDom) {
      log('Extracting nav links from live DOM (including shadow roots).');
      try {
        navLinksFromPage = await extractNavLinksFromPage(page, navSelectors);
      } catch (error) {
        logError(
          'Live DOM nav extraction failed; continuing with HTML-only extraction',
          error
        );
      }
    }

    log('Screenshot saved successfully.');
    return { success: true, html, screenshotPath, navLinksFromPage };
  } catch (error) {
    logError(`Failed to process ${url}`, error);
    return { success: false, html: null, screenshotPath, navLinksFromPage: [] };
  } finally {
    if (context) {
      await context.close();
    }
  }
}

export async function capturePage(
  url: string,
  readySelector: string,
  screenshotPath: string,
  options?: {
    navSelectors?: readonly string[];
    pierceShadowDom?: boolean;
  }
): Promise<{
  success: boolean;
  html: string | null;
  screenshotPath: string;
  navLinksFromPage: string[];
}> {
  return takeScreenshot(url, readySelector, screenshotPath, options);
}
