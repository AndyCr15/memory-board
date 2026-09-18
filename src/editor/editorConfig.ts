// =============================================================================
// Memory Board – Editor helpers
//
// Shared TipTap utilities used by MemoryEditorModal:
//   • formatAsContiguousCodeBlock – pure HTML formatter (unit-tested)
//   • wrapSelectionAsCodeBlock    – editor command + keyboard shortcut
//   • isViableDraft               – backdrop-autosave gate
// =============================================================================

import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

// ---------------------------------------------------------------------------
// Draft viability (backdrop autosave)
// ---------------------------------------------------------------------------

/**
 * A draft is worth persisting when it has a title, body text, or attachments.
 * Empty/blank notes are discarded rather than stored.
 */
export const isViableDraft = (
  title: string,
  contentText: string,
  attachmentCount = 0,
): boolean =>
  title.trim().length > 0 ||
  contentText.trim().length > 0 ||
  attachmentCount > 0;

// ---------------------------------------------------------------------------
// Code-block formatter
// ---------------------------------------------------------------------------

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
};

/**
 * Joins text-block strings with raw newlines so blank paragraphs become `\n`
 * inside a single code node rather than splitting the block.
 */
export const joinTextblocksAsCodeText = (lines: string[]): string =>
  lines.join('\n');

/**
 * Converts a multi-line string (including blank lines) into a single
 * contiguous `<pre><code>…</code></pre>` block. Newlines are preserved as
 * `\n` — they are never used to emit sequential sibling code blocks.
 */
export const formatAsContiguousCodeBlock = (plainText: string): string => {
  const escaped = plainText.replace(/[&<>]/g, (ch) => HTML_ESCAPE[ch] ?? ch);
  return `<pre><code>${escaped}</code></pre>`;
};

// ---------------------------------------------------------------------------
// TipTap command – wrap the current selection as one code block
// ---------------------------------------------------------------------------

/**
 * Converts the entire selected range into a single `codeBlock` node.
 *
 * TipTap's default `toggleCodeBlock` applies the node type per textblock, so
 * a selection of `para / empty para / para` becomes two code blocks split by
 * a leftover empty paragraph.  This command instead:
 *   1. Collects every textblock in the selection (empty ones contribute '').
 *   2. Joins them with `\n`.
 *   3. Replaces the whole range with one `codeBlock` containing that text.
 *
 * If the cursor is already inside a code block, the default toggle (lift) is
 * used so the shortcut remains a true on/off.
 */
export const wrapSelectionAsCodeBlock = (editor: Editor): boolean => {
  if (editor.isActive('codeBlock')) {
    return editor.chain().focus().toggleCodeBlock().run();
  }

  const { state } = editor;
  const { $from, $to } = state.selection;
  const range = $from.blockRange($to);

  if (!range) {
    return editor.chain().focus().setCodeBlock().run();
  }

  const codeBlockType = state.schema.nodes.codeBlock;
  if (!codeBlockType) return false;

  const lines: string[] = [];
  state.doc.nodesBetween(range.start, range.end, (node) => {
    if (node.isTextblock) {
      lines.push(node.textContent);
      return false;
    }
    return true;
  });

  const text = joinTextblocksAsCodeText(lines);
  const content = text.length > 0 ? state.schema.text(text) : null;
  const codeNode = content
    ? codeBlockType.create(null, content)
    : codeBlockType.create();

  return editor
    .chain()
    .focus()
    .command(({ tr, dispatch }) => {
      if (!dispatch) return true;
      tr.replaceWith(range.start, range.end, codeNode);
      const pos = Math.min(range.start + 1, tr.doc.content.size);
      tr.setSelection(TextSelection.near(tr.doc.resolve(pos)));
      return true;
    })
    .run();
};
