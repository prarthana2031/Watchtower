import type { Page } from 'playwright';
import { log, logError } from '../utils/logger.js';
import {
  DEFAULT_NAV_SELECTORS,
  FALLBACK_NAV_SELECTORS,
  mergeNavLinks,
} from '../differ/structural.js';

/**
 * Browser-side script as a string so tsx/esbuild never injects __name helpers
 * into code that runs inside page.evaluate().
 */
/** Playwright wraps string scripts as `arg => (script)(arg)` — parameter must be `arg`. */
const NAV_LINK_EXTRACTOR = String.raw`(arg) => {
  const sels = arg;
  const seen = new Set();
  const addAnchor = (anchor) => {
    if (!anchor || anchor.tagName !== 'A') return;
    const text = (anchor.textContent || '').trim().replace(/\s+/g, ' ');
    const href = anchor.getAttribute('href') || '';
    if (text && href) seen.add(text + '::' + href);
  };
  const queryRoot = (root, selector) => {
    try {
      root.querySelectorAll(selector).forEach((el) => {
        if (el.tagName === 'A') addAnchor(el);
      });
    } catch (_e) { /* invalid selector */ }
  };
  const walk = (root) => {
    for (let i = 0; i < sels.length; i++) queryRoot(root, sels[i]);
    if (root.querySelectorAll) {
      root.querySelectorAll('*').forEach((el) => {
        if (el.shadowRoot) walk(el.shadowRoot);
      });
    }
  };
  walk(document);
  return Array.from(seen);
}`;

/**
 * Collect nav links from the live DOM, piercing open shadow roots.
 * Mirrors extractNavLinksFromHtml selector strategy (primary, then fallback).
 */
export async function extractNavLinksFromPage(
  page: Page,
  selectors: readonly string[] = DEFAULT_NAV_SELECTORS
): Promise<string[]> {
  const primary = await queryNavLinksInPage(page, selectors);
  if (primary.length > 0) {
    return mergeNavLinks(primary);
  }
  return mergeNavLinks(await queryNavLinksInPage(page, FALLBACK_NAV_SELECTORS));
}

async function queryNavLinksInPage(
  page: Page,
  selectors: readonly string[]
): Promise<string[]> {
  const result = await page.evaluate(NAV_LINK_EXTRACTOR, [...selectors]);
  return Array.isArray(result) ? result : [];
}

/** Smoke test: read text inside a known Shadow DOM web component (MDN example). */
export async function runShadowDomSmokeTest(): Promise<boolean> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(
      'https://mdn.github.io/web-components-examples/popup-info-box-web-component/'
    );
    await page.waitForSelector('popup-info', { timeout: 10_000 });

    const text = await page.locator('popup-info').evaluate(
      String.raw`(arg) => {
        const span = arg.shadowRoot && arg.shadowRoot.querySelector('span');
        return span ? (span.textContent || '').trim() : null;
      }`
    );

    if (text && text.length > 0) {
      log(`Text inside shadow DOM: "${text}"`);
      log('Shadow DOM piercing works!');
      return true;
    }

    logError('Shadow DOM smoke test failed: could not read content inside shadow root.');
    return false;
  } catch (error) {
    logError('Shadow DOM smoke test failed', error);
    return false;
  } finally {
    await browser.close();
    log('Browser closed.');
  }
}
