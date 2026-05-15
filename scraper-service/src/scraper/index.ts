import { chromium, Browser, Page } from 'playwright';
import { log, logError } from '../utils/logger.js';

/**
 * Takes a screenshot of the given URL and saves it to the provided path.
 * Returns true if successful, false otherwise.
 */
export async function takeScreenshot(
  url: string,
  readySelector: string,
  screenshotPath: string
): Promise<boolean> {
  let browser: Browser | null = null;
  try {
    log(`Launching browser for ${url}`);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 }
    });
    const page: Page = await context.newPage();

    log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    log(`Waiting for selector "${readySelector}"`);
    await page.waitForSelector(readySelector, { timeout: 10000 });

    log(`Taking screenshot -> ${screenshotPath}`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    log(`Screenshot saved successfully.`);
    return true;
  } catch (error) {
    logError(`Failed to process ${url}`, error);
    return false;
  } finally {
    if (browser) {
      await browser.close();
      log('Browser closed.');
    }
  }
}