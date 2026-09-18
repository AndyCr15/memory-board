// =============================================================================
// Memory Board – MemoryDetailModal Component
//
// A centred, read-only inspection modal built on the native HTML5 <dialog>
// element.  Opens when the user clicks a memory card on the board.
//
// Layout (top → bottom inside the dialog):
//   ┌────────────────────────────────────────────────┐
//   │ 📌 Title                                    [×]  │ ← Pastel-themed header
//   │ #tag1 #tag2   Created: DD/MM/YYYY HH:mm        │
//   │               Updated: DD/MM/YYYY HH:mm        │
//   ├────────────────────────────────────────────────┤
//   │  Sanitised rich-text content (scrollable)      │
//   │  ┌──────────────────────────────────────┐      │
//   │  │ code block …            [Copy]       │      │
//   │  └──────────────────────────────────────┘      │
//   │  📎 Attachments                                 │
//   │    📄 file.pdf  420 KB    [⬇ Download]         │
//   ├────────────────────────────────────────────────┤
//   │ [✏️ Edit Memory]                    [× Close]  │ ← Footer
//   └────────────────────────────────────────────────┘
//
// Behaviour:
//   • Native <dialog showModal()> — focus-trapped, Escape closes it, the
//     browser returns focus to the originating element automatically.
//   • Backdrop click (e.target === dialog) closes the modal.
//   • "Edit" button closes the detail view and transitions to MemoryEditorModal.
//   • HTML is sanitised by sanitizeHtml() (DOMPurify) before injection.
//   • Copy buttons are injected into <pre><code> blocks imperatively.
//   • Attachment object URLs are tracked in objectUrlsRef and revoked on unmount.
// =============================================================================

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import type { Memory, MemoryAttachment } from '../types/memory';
import { THEME_CLASSES } from '../types/memory';
import { sanitizeHtml } from '../services/sanitizer';
import { formatBytes } from '../services/imageOptimizer';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MemoryDetailModalProps {
  memory: Memory;
  /** Called when the modal is dismissed by any means (Escape, ×, backdrop). */
  onClose: () => void;
  /** Called when the user clicks "Edit" – parent should open MemoryEditorModal. */
  onEdit: (memory: Memory) => void;
}

// ---------------------------------------------------------------------------
// Date helper – UK format: DD/MM/YYYY HH:mm
// ---------------------------------------------------------------------------

const formatUKDateTime = (ts: number): string => {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MemoryDetailModal: React.FC<MemoryDetailModalProps> = ({
  memory,
  onClose,
  onEdit,
}) => {
  const dialogRef     = useRef<HTMLDialogElement>(null);
  const contentRef    = useRef<HTMLDivElement>(null);
  // Track generated object URLs so we can revoke them all on unmount
  const objectUrlsRef = useRef<string[]>([]);
  // Stable ref to onClose so the 'close' event listener never goes stale
  const onCloseRef    = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // --------------------------------------------------------------------------
  // Sanitise content – memoised so it only runs once per memory
  // --------------------------------------------------------------------------
  const sanitizedContent = useMemo(
    () => sanitizeHtml(memory.contentHtml),
    [memory.contentHtml],
  );

  // --------------------------------------------------------------------------
  // Dialog lifecycle: showModal, close-event wiring, URL cleanup
  // --------------------------------------------------------------------------
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // The native 'close' event fires for ALL dismissal paths:
    //   Escape key, dialog.close(), and our programmatic handleClose calls.
    const handleNativeClose = () => onCloseRef.current();
    dialog.addEventListener('close', handleNativeClose);

    // showModal() puts the dialog in the top layer with built-in:
    //   • Focus trapping within the dialog
    //   • Automatic focus return to the originating element on close
    //   • Escape key → cancel event → close event
    dialog.showModal();

    return () => {
      dialog.removeEventListener('close', handleNativeClose);
      // Revoke all tracked blob URLs to prevent memory leaks
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --------------------------------------------------------------------------
  // Inject copy buttons into <pre><code> blocks after content renders
  // --------------------------------------------------------------------------
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const pres = Array.from(container.querySelectorAll<HTMLElement>('pre'));
    const cleanupFns: Array<() => void> = [];

    pres.forEach((pre) => {
      const code = pre.querySelector('code');
      if (!code) return;

      // Position the pre relatively so the absolute button sits inside it
      pre.style.position = 'relative';

      // Build the copy button with inline styles (dynamic DOM, not scanned by Tailwind JIT)
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Copy';
      btn.setAttribute('aria-label', 'Copy code to clipboard');
      btn.style.cssText = `
        position: absolute; top: 8px; right: 8px;
        padding: 3px 10px; border-radius: 6px; border: none; cursor: pointer;
        font-size: 11px; font-family: ui-monospace, 'Cascadia Code', monospace;
        background: #374151; color: #d1d5db;
        opacity: 0; transition: opacity 150ms, background 150ms, color 150ms;
        z-index: 1;
      `;

      // Show / hide on pre hover
      const showBtn = () => { btn.style.opacity = '1'; };
      const hideBtn = () => { btn.style.opacity = '0'; };

      const copyHandler = async () => {
        try {
          await navigator.clipboard.writeText(code.textContent ?? '');
          btn.textContent = '✓ Copied!';
          btn.style.background = '#059669';
          btn.style.color = '#ffffff';
          setTimeout(() => {
            btn.textContent = 'Copy';
            btn.style.background = '#374151';
            btn.style.color = '#d1d5db';
          }, 2000);
        } catch {
          // Clipboard API unavailable in insecure contexts – fail silently
        }
      };

      pre.addEventListener('mouseenter', showBtn);
      pre.addEventListener('mouseleave', hideBtn);
      btn.addEventListener('click', copyHandler);
      pre.appendChild(btn);

      cleanupFns.push(() => {
        pre.removeEventListener('mouseenter', showBtn);
        pre.removeEventListener('mouseleave', hideBtn);
        btn.removeEventListener('click', copyHandler);
        btn.parentElement?.removeChild(btn);
      });
    });

    return () => cleanupFns.forEach((fn) => fn());
  }, [sanitizedContent]);

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------

  /** Programmatically close the dialog (fires native 'close' event → onClose). */
  const handleClose = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  /**
   * Close the detail view and transition to the editor.
   * Both state changes are batched by React 18 automatic batching, so the
   * detail modal unmounts and editor mounts in a single render cycle.
   */
  const handleEdit = useCallback(() => {
    dialogRef.current?.close(); // → 'close' event → onClose() → setDetailMemory(null)
    onEdit(memory);              // → setEditorOpen(true) + setEditingMemory(memory)
  }, [memory, onEdit]);

  /**
   * Backdrop-click detection: when showModal() is active the dialog element's
   * hit area covers the entire viewport.  Clicks on its background (outside the
   * inner content div) have e.target === dialog.  The inner content div stops
   * propagation, so only backdrop clicks reach this handler.
   */
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === dialogRef.current) handleClose();
    },
    [handleClose],
  );

  /**
   * Downloads an attachment by creating a temporary object URL.
   * The URL is tracked in objectUrlsRef and revoked when the modal unmounts.
   */
  const handleDownload = useCallback((att: MemoryAttachment) => {
    const blob =
      att.data instanceof Blob
        ? att.data
        : new Blob([att.data], { type: att.mimeType });

    const url = URL.createObjectURL(blob);
    objectUrlsRef.current.push(url); // Will be revoked on unmount

    const a = document.createElement('a');
    a.href = url;
    a.download = att.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  const theme = THEME_CLASSES[memory.colorTheme];

  return (
    /*
     * The <dialog> element itself acts as both the top-layer overlay and the
     * backdrop-click detector.  The inner <div> (onClick stopPropagation) holds
     * all visual content – only clicks that miss the inner div reach the dialog's
     * onClick and trigger handleBackdropClick.
     */
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className="memory-detail-dialog shadow-2xl"
      aria-label={`Memory: ${memory.title || 'Untitled'}`}
    >
      {/* Inner container – flex column, stops click propagation to dialog */}
      <div
        className="flex flex-col h-full overflow-hidden rounded-2xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >

        {/* ================================================================
            Header – pastel-themed, sticky
            ================================================================ */}
        <div className={`${theme.accent} px-6 py-4 border-b border-black/10 shrink-0`}>
          <div className="flex items-start gap-3">

            {/* Title + tags + timestamps */}
            <div className="flex-1 min-w-0">
              {/* Title row */}
              <div className="flex items-center gap-2">
                {memory.isPinned && (
                  <span className="text-yellow-500 text-base" title="Pinned to top">
                    📌
                  </span>
                )}
                <h2 className="text-xl font-bold text-gray-900 leading-snug">
                  {memory.title || (
                    <em className="text-gray-400 font-normal">Untitled</em>
                  )}
                </h2>
              </div>

              {/* Tag chips */}
              {memory.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {memory.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-0.5 bg-white/60 rounded-full text-xs font-medium text-gray-700 border border-black/5"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Timestamps – UK DD/MM/YYYY HH:mm */}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                <span>Created: {formatUKDateTime(memory.createdAt)}</span>
                <span>Updated: {formatUKDateTime(memory.updatedAt)}</span>
              </div>
            </div>

            {/* Header actions – close only; Edit lives in the footer */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleClose}
                className="w-8 h-8 flex items-center justify-center text-2xl leading-none text-gray-400 hover:text-gray-700 hover:bg-black/10 rounded-lg transition-colors"
                title="Close (Esc)"
                aria-label="Close modal"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        {/* ================================================================
            Body – scrollable content area
            ================================================================ */}
        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 bg-white">

          {/* Rich-text content */}
          {sanitizedContent.trim() ? (
            <div
              ref={contentRef}
              className="tiptap-content"
              dangerouslySetInnerHTML={{ __html: sanitizedContent }}
            />
          ) : (
            <p className="text-gray-400 italic text-sm">No content.</p>
          )}

          {/* Attachments section */}
          {memory.attachments.length > 0 && (
            <div className="mt-6 pt-5 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                📎 Attachments ({memory.attachments.length})
              </p>
              <ul className="space-y-2" role="list">
                {memory.attachments.map((att) => (
                  <li
                    key={att.id}
                    className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                  >
                    <span className="text-base shrink-0" aria-hidden>📄</span>
                    <span className="flex-1 truncate text-gray-700 font-medium" title={att.name}>
                      {att.name}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                      {formatBytes(att.size)}
                    </span>
                    <button
                      onClick={() => handleDownload(att)}
                      className="shrink-0 px-2.5 py-1 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
                      aria-label={`Download ${att.name}`}
                    >
                      ⬇ Download
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ================================================================
            Footer – actions
            ================================================================ */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/80 flex items-center justify-between shrink-0">
          <button
            onClick={handleEdit}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl shadow-sm transition-colors"
          >
            ✏️ Edit Memory
          </button>
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            × Close
          </button>
        </div>
      </div>
    </dialog>
  );
};
