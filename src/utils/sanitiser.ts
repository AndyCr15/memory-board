/**
 * Link-safe HTML helpers.
 * Only http, https, and mailto hrefs are kept. Every surviving anchor is
 * forced to open in a new tab without leaking window.opener.
 */

const SAFE_PROTOCOL = /^(https?:|mailto:)/i;

export const isSafeHref = (href: string): boolean => {
  const value = href.trim();
  if (!SAFE_PROTOCOL.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
};

/** Prefix a bare domain with https://. Leaves explicit schemes unchanged. */
export const normaliseLinkUrl = (raw: string): string => {
  const value = raw.trim();
  if (SAFE_PROTOCOL.test(value)) return value;
  if (/^[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(value)) return `https://${value}`;
  return value;
};

/**
 * Keep safe anchors, unwrap the rest (javascript:, data:, relative paths),
 * and stamp target/rel on every remaining link.
 */
export const enforceSafeAnchors = (root: ParentNode): void => {
  const anchors = Array.from(root.querySelectorAll('a'));
  for (const anchor of anchors) {
    const href = anchor.getAttribute('href') ?? '';
    if (!isSafeHref(href)) {
      const parent = anchor.parentNode;
      if (!parent) {
        anchor.remove();
        continue;
      }
      while (anchor.firstChild) parent.insertBefore(anchor.firstChild, anchor);
      anchor.remove();
      continue;
    }
    anchor.setAttribute('href', href.trim());
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer');
  }
};

/** Parse an HTML fragment, harden its anchors, and return the markup. */
export const sanitiseAnchorsInHtml = (html: string): string => {
  const scratch = document.createElement('div');
  scratch.innerHTML = html;
  enforceSafeAnchors(scratch);
  return scratch.innerHTML;
};
