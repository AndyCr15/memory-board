// =============================================================================
// Contiguous code-block formatter + TipTap wrap command
// =============================================================================

import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {
  formatAsContiguousCodeBlock,
  joinTextblocksAsCodeText,
  wrapSelectionAsCodeBlock,
} from './editorConfig';

describe('formatAsContiguousCodeBlock', () => {
  it('wraps a multi-line string with blank lines into a single <pre><code> block', () => {
    const input = 'const a = 1;\n\nconst b = 2;';
    const html = formatAsContiguousCodeBlock(input);

    expect(html).toBe('<pre><code>const a = 1;\n\nconst b = 2;</code></pre>');
    expect((html.match(/<pre>/g) ?? []).length).toBe(1);
    expect((html.match(/<code>/g) ?? []).length).toBe(1);
    expect(html).toContain('\n\n');
    expect(html).not.toMatch(/<\/pre>\s*<pre>/);
  });

  it('escapes HTML metacharacters inside the code body', () => {
    const html = formatAsContiguousCodeBlock('<script>alert(1)</script>');
    expect(html).toBe(
      '<pre><code>&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>',
    );
  });
});

describe('joinTextblocksAsCodeText', () => {
  it('preserves empty strings as blank lines between neighbouring blocks', () => {
    expect(joinTextblocksAsCodeText(['foo', '', 'bar'])).toBe('foo\n\nbar');
  });
});

describe('wrapSelectionAsCodeBlock', () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  it('converts paragraphs separated by a blank line into one code block with newlines', () => {
    editor = new Editor({
      extensions: [StarterKit],
      content: '<p>const a = 1;</p><p></p><p>const b = 2;</p>',
    });

    editor.commands.selectAll();
    wrapSelectionAsCodeBlock(editor);

    const html = editor.getHTML();
    expect((html.match(/<pre>/g) ?? []).length).toBe(1);
    expect(html).toMatch(/<pre><code>[\s\S]*<\/code><\/pre>/);
    expect(html).not.toMatch(/<\/pre>\s*(<p><\/p>)?\s*<pre>/);

    const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n');
    expect(text).toContain('const a = 1;');
    expect(text).toContain('const b = 2;');
    expect(text).toContain('\n');
  });
});
