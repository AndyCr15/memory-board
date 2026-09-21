// =============================================================================
// Memory Board – HTML Sanitiser (DOMPurify wrapper)
//
// Purpose: strip all executable content from TipTap-generated HTML before it
// is injected into the read-only MemoryDetailModal via dangerouslySetInnerHTML.
//
// Two-phase strategy:
//   Phase 1 – DOMPurify structural sanitisation:
//     Removes <script>, event handlers (onclick, onerror …), javascript: hrefs,
//     and any other dangerous constructs.  Returns a safe HTML string.
//
//   Phase 2 – Additional data: URI validation:
//     DOMPurify's ADD_DATA_URI_TAGS option whitelists <img> data: URIs so that
//     TipTap-embedded WebP/JPEG blobs are preserved.  We post-process to ensure
//     only data:image/* schemes are accepted; data:text/html, data:application/*,
//     etc. are stripped.
//
// The implementation avoids global DOMPurify hooks (which persist on the
// singleton and accumulate in test runs); instead it uses a second DOM pass on
// the sanitised string, which is safe because DOMPurify has already neutralised
// all executable content before we touch the DOM.
// =============================================================================

import DOMPurify from 'dompurify';
import { enforceSafeAnchors } from '../utils/sanitiser';

// ---------------------------------------------------------------------------
// Allowed tag / attribute set (TipTap rich-text output)
// ---------------------------------------------------------------------------

// Intentionally untyped – avoids a type-mismatch between @types/dompurify and
// the embedded type declarations inside the dompurify ESM bundle.
const BASE_CONFIG = {
  ALLOWED_TAGS: [
    // Inline formatting
    'p', 'br', 'hr',
    'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark', 'sup', 'sub',
    // Headings
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    // Lists
    'ul', 'ol', 'li',
    // Block elements
    'blockquote', 'pre', 'code', 'div', 'span',
    // Media – images are allowed; data:image/* is whitelisted in phase 2
    'img', 'figure', 'figcaption',
    // Links
    'a',
    // Tables (future-proofing)
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  ],
  ALLOWED_ATTR: [
    // Generic
    'class', 'id', 'title',
    // Anchor
    'href', 'target', 'rel',
    // Image
    'src', 'alt', 'width', 'height',
    // Table
    'colspan', 'rowspan',
    // TipTap code-block language annotation
    'data-language',
  ],
  // Allow data: URIs inside <img> so that base64 images produced by
  // imageOptimizer and stored in contentHtml are rendered correctly.
  ADD_DATA_URI_TAGS: ['img'],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sanitises a raw HTML string for safe injection into the DOM.
 *
 * @param dirty - Raw HTML from `memory.contentHtml`
 * @returns A safe HTML string stripped of all executable content
 *
 * @example
 * sanitizeHtml('<script>alert(1)</script><p>Hello</p>') // → '<p>Hello</p>'
 * sanitizeHtml('<img src="data:image/webp;base64,…" />')  // → preserved
 * sanitizeHtml('<img src="data:text/html,…" />')          // → src removed
 */
export const sanitizeHtml = (dirty: string): string => {
  // ---- Phase 1: DOMPurify structural sanitisation ------------------------
  const phase1 = DOMPurify.sanitize(dirty, BASE_CONFIG) as string;

  // ---- Phase 2: Validate data: URIs in <img> src -------------------------
  // We parse the sanitised string into a temporary div so we can query and
  // fix any data: URIs that DOMPurify allowed but are not image types.
  // (DOMPurify's ADD_DATA_URI_TAGS whitelists all data: schemes for the tag.)
  const scratch = document.createElement('div');
  scratch.innerHTML = phase1;

  scratch.querySelectorAll('img[src^="data:"]').forEach((img) => {
    const src = img.getAttribute('src') ?? '';
    // Only data:image/* URIs are safe to render in an <img> tag
    if (!src.startsWith('data:image/')) {
      img.removeAttribute('src');
    }
  });

  // Keep http(s)/mailto anchors only, and force a safe new-tab policy.
  enforceSafeAnchors(scratch);

  return scratch.innerHTML;
};
