import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractNavLinksFromHtml,
  formatNavLink,
  hashFromArray,
  hasChanged,
  mergeNavLinks,
} from './structural.js';

const NAV_HTML = `
  <html><body>
    <nav>
      <a href="/docs">Docs</a>
      <a href="/blog">Blog</a>
    </nav>
  </body></html>
`;

describe('formatNavLink', () => {
  it('normalizes whitespace in link text', () => {
    assert.equal(formatNavLink('  Hello   world  ', '/x'), 'Hello world::/x');
  });
});

describe('extractNavLinksFromHtml', () => {
  it('extracts links from nav anchors', () => {
    const links = extractNavLinksFromHtml(NAV_HTML);
    assert.deepEqual(links, ['Blog::/blog', 'Docs::/docs']);
  });

  it('dedupes and sorts links', () => {
    const html = `
      <nav>
        <a href="/z">Zebra</a>
        <a href="/a">Alpha</a>
        <a href="/a">Alpha</a>
      </nav>
    `;
    const links = extractNavLinksFromHtml(html);
    assert.deepEqual(links, ['Alpha::/a', 'Zebra::/z']);
  });

  it('uses custom selectors when provided', () => {
    const html = '<div class="menu"><a href="/x">Only</a></div>';
    const links = extractNavLinksFromHtml(html, ['.menu a[href]']);
    assert.deepEqual(links, ['Only::/x']);
  });

  it('falls back to header/main/footer when nav is empty', () => {
    const html = '<header><a href="/home">Home</a></header>';
    const links = extractNavLinksFromHtml(html, ['nav a[href]']);
    assert.deepEqual(links, ['Home::/home']);
  });
});

describe('mergeNavLinks', () => {
  it('merges, dedupes, and sorts groups', () => {
    const merged = mergeNavLinks(['Z::/z'], ['A::/a', 'Z::/z']);
    assert.deepEqual(merged, ['A::/a', 'Z::/z']);
  });
});

describe('hashFromArray', () => {
  it('returns stable SHA-256 hex for the same input', () => {
    const items = ['A::/a', 'B::/b'];
    assert.equal(hashFromArray(items), hashFromArray(items));
    assert.match(hashFromArray(items), /^[a-f0-9]{64}$/);
  });

  it('hashes empty array to known value', () => {
    assert.equal(
      hashFromArray([]),
      '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'
    );
  });
});

describe('hasChanged', () => {
  it('treats first run as changed', () => {
    assert.equal(hasChanged(null, hashFromArray(['A::/a'])), true);
  });

  it('returns false when hashes match', () => {
    const hash = hashFromArray(['A::/a']);
    assert.equal(hasChanged(hash, hash), false);
  });

  it('returns true when hashes differ', () => {
    const oldHash = hashFromArray(['A::/a']);
    const newHash = hashFromArray(['B::/b']);
    assert.equal(hasChanged(oldHash, newHash), true);
  });
});
