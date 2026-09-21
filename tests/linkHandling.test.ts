import { describe, expect, it } from 'vitest';
import { sanitiseAnchorsInHtml } from '../src/utils/sanitiser';
import { sanitizeHtml } from '../src/services/sanitizer';

describe('link sanitisation', () => {
  it('preserves https anchors and strips javascript: links', () => {
    const input =
      '<p><a href="https://example.com">Safe</a> <a href="javascript:alert(1)">Bad</a></p>';
    const result = sanitiseAnchorsInHtml(input);

    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('>Safe</a>');
    expect(result).not.toContain('javascript:');
    expect(result).toContain('Bad');
    expect(result).not.toMatch(/<a[^>]*href="javascript:/i);
  });

  it('injects target="_blank" and rel="noopener noreferrer" on safe links', () => {
    const result = sanitiseAnchorsInHtml('<a href="https://example.com">Link</a>');

    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it('keeps mailto links and rejects data: hrefs through the full sanitiser', () => {
    const mail = sanitizeHtml('<a href="mailto:ada@example.com">Mail</a>');
    expect(mail).toContain('href="mailto:ada@example.com"');
    expect(mail).toContain('rel="noopener noreferrer"');

    const data = sanitizeHtml('<a href="data:text/html,hi">Data</a>');
    expect(data).not.toContain('data:text/html');
    expect(data).toContain('Data');
  });
});
