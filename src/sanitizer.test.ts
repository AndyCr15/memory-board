// =============================================================================
// Memory Board – sanitizeHtml() Unit Tests (Vitest + jsdom)
//
// Vitest is configured with environment: 'jsdom' in vite.config.ts, which
// provides the DOM APIs required by DOMPurify and our Phase-2 post-processor.
//
// Test coverage:
//   1. Malicious <script> tags are stripped
//   2. javascript: href attributes are removed
//   3. Inline event handlers (onclick, onerror, etc.) are stripped
//   4. Standard TipTap rich-text markup is preserved intact
//   5. data:image/* URIs in <img> src are kept (imageOptimizer output)
//   6. Non-image data: URIs (data:text/html, data:application/*) are removed
//   7. <pre><code> code blocks survive sanitisation
//   8. External links get target=_blank + rel=noopener noreferrer
// =============================================================================

import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from './services/sanitizer';

// ---------------------------------------------------------------------------
// Helper: returns true if the string contains no <script> tags
// ---------------------------------------------------------------------------
const hasNoScript = (html: string) =>
  !html.toLowerCase().includes('<script') && !html.toLowerCase().includes('</script');

describe('sanitizeHtml – XSS prevention', () => {
  // ---- 1. Script tag removal -----------------------------------------------

  it('strips bare <script> tags entirely', () => {
    const input = '<p>Safe text</p><script>alert("xss")</script>';
    const result = sanitizeHtml(input);

    expect(hasNoScript(result)).toBe(true);
    expect(result).not.toContain('alert');
    expect(result).toContain('Safe text');
  });

  it('strips <script> with src attribute', () => {
    const input = '<script src="https://evil.example/payload.js"></script><p>ok</p>';
    const result = sanitizeHtml(input);

    expect(hasNoScript(result)).toBe(true);
    expect(result).toContain('ok');
  });

  it('strips <script> with type attribute', () => {
    const input = '<script type="text/javascript">document.cookie = "stolen";</script>';
    const result = sanitizeHtml(input);

    expect(hasNoScript(result)).toBe(true);
    expect(result).not.toContain('document.cookie');
  });

  // ---- 2. javascript: href -------------------------------------------------

  it('strips javascript: href from anchor tags', () => {
    const input = '<a href="javascript:alert(1)">Click me</a>';
    const result = sanitizeHtml(input);

    expect(result).not.toContain('javascript:');
  });

  it('preserves safe http: hrefs on anchor tags', () => {
    const input = '<a href="https://example.com">Visit</a>';
    const result = sanitizeHtml(input);

    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('Visit');
  });

  // ---- 3. Inline event handlers --------------------------------------------

  it('strips onclick event handler from paragraph', () => {
    const input = '<p onclick="alert(1)">Click</p>';
    const result = sanitizeHtml(input);

    expect(result).not.toContain('onclick');
    // The paragraph itself should survive
    expect(result).toContain('Click');
  });

  it('strips onerror handler from img tag', () => {
    const input = '<img src="x" onerror="alert(1)" alt="test">';
    const result = sanitizeHtml(input);

    expect(result).not.toContain('onerror');
  });

  it('strips onmouseover and other event attributes', () => {
    const input = '<div onmouseover="fetch(\'//evil.example\')" class="card">text</div>';
    const result = sanitizeHtml(input);

    expect(result).not.toContain('onmouseover');
    expect(result).toContain('text');
  });
});

describe('sanitizeHtml – rich-text preservation', () => {
  // ---- 4. TipTap standard output -------------------------------------------

  it('preserves heading tags h1–h3', () => {
    const input = '<h1>Title</h1><h2>Sub</h2><h3>Minor</h3>';
    const result = sanitizeHtml(input);

    expect(result).toContain('<h1>Title</h1>');
    expect(result).toContain('<h2>Sub</h2>');
    expect(result).toContain('<h3>Minor</h3>');
  });

  it('preserves strong, em, and paragraph tags', () => {
    const input = '<p>Text with <strong>bold</strong> and <em>italic</em>.</p>';
    const result = sanitizeHtml(input);

    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('<em>italic</em>');
  });

  it('preserves unordered and ordered lists', () => {
    const input =
      '<ul><li>Item A</li><li>Item B</li></ul>' +
      '<ol><li>First</li><li>Second</li></ol>';
    const result = sanitizeHtml(input);

    expect(result).toContain('<ul>');
    expect(result).toContain('<li>Item A</li>');
    expect(result).toContain('<ol>');
    expect(result).toContain('<li>First</li>');
  });

  it('preserves blockquote elements', () => {
    const input = '<blockquote><p>Quote text</p></blockquote>';
    const result = sanitizeHtml(input);

    expect(result).toContain('<blockquote>');
    expect(result).toContain('Quote text');
  });

  // ---- 5. data:image/* in img src (imageOptimizer output) ------------------

  it('preserves data:image/webp base64 src in img tags', () => {
    // Real imageOptimizer output looks like this
    const src = 'data:image/webp;base64,UklGRlYAAABXRUJQVlA4IEoAAADQAQ==';
    const input = `<img src="${src}" alt="screenshot">`;
    const result = sanitizeHtml(input);

    expect(result).toContain('data:image/webp;base64');
  });

  it('preserves data:image/jpeg base64 src in img tags', () => {
    const src = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAgAAZABkAAD';
    const input = `<img src="${src}" alt="photo">`;
    const result = sanitizeHtml(input);

    expect(result).toContain('data:image/jpeg;base64');
  });

  // ---- 6. Non-image data: URIs are stripped --------------------------------

  it('removes data:text/html src from img tags (Phase 2 validation)', () => {
    const dangerous = '<img src="data:text/html,<script>alert(1)</script>" alt="x">';
    const result = sanitizeHtml(dangerous);

    expect(result).not.toContain('data:text/html');
    // The img tag itself may survive but without the dangerous src
    expect(result).not.toContain('alert');
  });

  it('removes data:application/javascript src from img tags', () => {
    const dangerous = '<img src="data:application/javascript,alert(1)" alt="x">';
    const result = sanitizeHtml(dangerous);

    expect(result).not.toContain('data:application/javascript');
  });

  // ---- 7. Code blocks ------------------------------------------------------

  it('preserves pre and code elements with class attributes', () => {
    const input =
      '<pre><code class="language-typescript">const x: number = 42;</code></pre>';
    const result = sanitizeHtml(input);

    expect(result).toContain('<pre>');
    expect(result).toContain('<code');
    expect(result).toContain('const x: number = 42;');
  });

  // ---- 8. External link hardening ------------------------------------------

  it('adds target=_blank and rel=noopener noreferrer to http links', () => {
    const input = '<a href="https://example.com">Link</a>';
    const result = sanitizeHtml(input);

    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it('unwraps relative links instead of opening them in a new tab', () => {
    const input = '<a href="/local/path">Internal link</a>';
    const result = sanitizeHtml(input);

    expect(result).not.toContain('<a');
    expect(result).toContain('Internal link');
    expect(result).not.toContain('target="_blank"');
  });
});
