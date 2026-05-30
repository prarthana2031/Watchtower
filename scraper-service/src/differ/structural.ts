/* Parses HTML → structures nav data → hashes → compares hashes. */

import * as cheerio from 'cheerio';
import * as crypto from 'crypto';

/** Primary selectors tried on every page (HTML and live DOM). */
export const DEFAULT_NAV_SELECTORS = [
  'nav a[href]',
  '[role="navigation"] a[href]',
  'header nav a[href]',
  'aside nav a[href]',
] as const;

/** Used only when primary selectors find no links. */
export const FALLBACK_NAV_SELECTORS = [
  'header a[href]',
  'main a[href]',
  'footer a[href]',
] as const;

export function formatNavLink(text: string, href: string): string {
  const normalizedText = text.trim().replace(/\s+/g, ' ');
  return `${normalizedText}::${href}`;
}

export function mergeNavLinks(...groups: string[][]): string[] {
  const seen = new Set<string>();
  for (const group of groups) {
    for (const link of group) {
      seen.add(link);
    }
  }
  return [...seen].sort();
}

function collectFromHtml(
  html: string,
  selectors: readonly string[]
): string[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();

  for (const selector of selectors) {
    try {
      $(selector).each((_, el) => {
        const text = $(el).text();
        const href = $(el).attr('href') ?? '';
        if (text.trim() && href) {
          seen.add(formatNavLink(text, href));
        }
      });
    } catch {
      // invalid selector for cheerio — skip
    }
  }

  return [...seen];
}

/**
 * Extract nav links from static HTML via CSS selectors.
 * Falls back to header/main/footer anchors when nothing matches.
 */
export function extractNavLinksFromHtml(
  html: string,
  selectors: readonly string[] = DEFAULT_NAV_SELECTORS
): string[] {
  const primary = collectFromHtml(html, selectors);
  if (primary.length > 0) {
    return mergeNavLinks(primary);
  }
  const fallback = collectFromHtml(html, FALLBACK_NAV_SELECTORS);
  return mergeNavLinks(fallback);
}

/** @deprecated Use extractNavLinksFromHtml — kept for compatibility. */
export function extractNavLinks(
  html: string,
  selectors?: readonly string[]
): string[] {
  return extractNavLinksFromHtml(html, selectors ?? DEFAULT_NAV_SELECTORS);
}

export function hashFromArray(items: string[]): string {
  const data = JSON.stringify(items);
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function hasChanged(oldHash: string | null, newHash: string): boolean {
  if (oldHash === null) return true;
  return oldHash !== newHash;
}
