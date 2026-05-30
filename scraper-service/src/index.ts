import { capturePage, closeBrowser } from './scraper/index.js';
import { log, logError } from './utils/logger.js';
import { SiteConfig } from './types/index.js';
import sites from './config/sites.json' with { type: 'json' };
import robotsParser, { type Robot } from 'robots-parser';
import pLimit from 'p-limit';
import fs from 'fs/promises';
import path from 'path';
import {
  DEFAULT_NAV_SELECTORS,
  extractNavLinksFromHtml,
  hashFromArray,
  hasChanged,
  mergeNavLinks,
} from './differ/structural.js';
import { getLatestSnapshot, addSnapshot } from './db/index.js';
import { snapshot } from './types/index.js';

const ROBOTS_USER_AGENT = 'watchtower';
const ROBOTS_FETCH_TIMEOUT_MS = 5_000;
const CONCURRENCY = 5;

const robotsCache = new Map<string, Robot>();

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log('Watchtower – Starting screenshot capture...');

  await ensureDir('screenshots');

  const validSites = validateSites(sites);
  log(`Loaded ${validSites.length} valid site(s). Running up to ${CONCURRENCY} in parallel.`);

  const limit = pLimit(CONCURRENCY);

  try {
    await Promise.all(
      validSites.map((site) => limit(() => processSite(site)))
    );
    log('All done.');
  } finally {
    await closeBrowser();
  }
}

// ─── Per-site logic ───────────────────────────────────────────────────────────

async function processSite(site: SiteConfig): Promise<void> {
  if (site.respectRobotsTxt) {
    const allowed = await isAllowedByRobots(site.url);
    if (!allowed) {
      log(`Skipping ${site.name}: robots.txt disallows ${site.url}`);
      return;
    }
  }

  const safeName = site.name.replace(/\s+/g, '_').toLowerCase();
  const screenshotPath = `screenshots/${safeName}_${Date.now()}.png`;
  const navSelectors = site.navSelectors ?? DEFAULT_NAV_SELECTORS;
  const result = await capturePage(site.url, site.readySelector, screenshotPath, {
    navSelectors,
    pierceShadowDom: site.pierceShadowDom ?? true,
  });

  if (!result.success) {
    logError(`❌ Failed to capture ${site.name}`);
    return;
  }

  const htmlLinks = extractNavLinksFromHtml(result.html ?? '', navSelectors);
  const navLinks = mergeNavLinks(htmlLinks, result.navLinksFromPage);
  if (navLinks.length === 0) {
    log(`⚠️ No nav links extracted for ${site.name} — check navSelectors in sites.json`);
  } else {
    log(`Extracted ${navLinks.length} nav link(s) for ${site.name}`);
  }
  const newHash = hashFromArray(navLinks);

  const latest = getLatestSnapshot(site.url);
  const changed = hasChanged(latest?.domHash ?? null, newHash);

  if (changed) {
    log(`🆕 CHANGE DETECTED for ${site.name}`);
  } else {
    log(`✅ No change for ${site.name}`);
  }

  const snapshotRecord: snapshot = {
    url: site.url,
    sitename: site.name,
    domHash: newHash,
    capturedAt: new Date(),
    screenshotpath: result.screenshotPath,
  };
  addSnapshot(snapshotRecord);
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validateSites(raw: unknown[]): SiteConfig[] {
  const valid: SiteConfig[] = [];

  for (const entry of raw) {
    if (
      entry !== null &&
      typeof entry === 'object' &&
      'name' in entry && typeof (entry as Record<string, unknown>).name === 'string' &&
      'url' in entry && typeof (entry as Record<string, unknown>).url === 'string'
    ) {
      valid.push(entry as SiteConfig);
    } else {
      logError('Invalid site config entry, skipping', entry);
    }
  }

  return valid;
}

// ─── Robots.txt ──────────────────────────────────────────────────────────────

async function isAllowedByRobots(url: string): Promise<boolean> {
  try {
    const robots = await getRobotsParser(url);
    if (!robots) return true; // couldn't fetch → allow by default

    const allowed = robots.isAllowed(url, ROBOTS_USER_AGENT);
    return allowed ?? true;
  } catch (error) {
    logError(`robots.txt check failed for ${url}`, error);
    return false;
  }
}

async function getRobotsParser(url: string): Promise<Robot | null> {
  const origin = new URL(url).origin;

  const cached = robotsCache.get(origin);
  if (cached !== undefined) return cached;

  const robotsUrl = `${origin}/robots.txt`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ROBOTS_FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(robotsUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 404) {
      log(`robots.txt not found for ${origin}; allowing by default.`);
      const parser = robotsParser(robotsUrl, '');
      robotsCache.set(origin, parser);
      return parser;
    }

    if (!response.ok) {
      logError(`Failed to fetch robots.txt for ${origin}`, new Error(`HTTP ${response.status}`));
      return null; // don't cache — may be transient (5xx, 403, etc.)
    }

    const text = await response.text();
    const parser = robotsParser(robotsUrl, text);
    robotsCache.set(origin, parser);
    return parser;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      logError(`robots.txt fetch timed out for ${origin}`);
    } else {
      logError(`Unable to fetch robots.txt for ${origin}`, error);
    }
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(path.resolve(dir), { recursive: true });
  } catch (error) {
    logError(`Could not create directory: ${dir}`, error);
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

main().catch((err) => {
  logError('Unhandled error in main', err);
  process.exit(1);
});