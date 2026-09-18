// =============================================================================
// Memory Board – MemoryEditorModal Component
//
// Full-screen modal for creating and editing memories.
//
// Layout (top→bottom):
//   ┌──────────────────────────────────────────────────┐
//   │ Header: title input + close button               │
//   ├──────────────────────────────────────────────────┤
//   │ Toolbar: bold, italic, H1-H3, code block, image  │
//   │ TipTap editor (rich text, paste/drop images)     │
//   ├──────────────────────────────────────────────────┤
//   │ Colour theme picker                              │
//   │ Tags input (comma / Enter to add)                │
//   │ Attachments (files ≤ 1 MB)                       │
//   ├──────────────────────────────────────────────────┤
//   │ Footer: Cancel + Save buttons                    │
//   └──────────────────────────────────────────────────┘
//
// Image data flow:
//   Paste / drop → imageOptimizer.optimizeImage() → blobToDataUrl()
//   → editor.setImage({ src: dataUrl })
//   The data-URL is embedded directly in contentHtml; no separate storage.
//
// Attachment data flow:
//   File picker → apiService.uploadAttachment() (1 MB cap) → metadata on draft
//   Save / backdrop autosave → apiService.saveMemory() → IndexedDB write-through
// =============================================================================

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { generateHTML } from '@tiptap/core';
import { useEditor, EditorContent, ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import ImageExtension from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight, common } from 'lowlight';

import type { Memory, MemoryAttachment, ColorTheme } from '../types/memory';
import { THEME_CLASSES, COLOR_THEME_OPTIONS } from '../types/memory';
import { DEFAULT_COLOR_THEME } from '../db/database';
import {
  optimizeImage,
  blobToDataUrl,
  formatBytes,
} from '../services/imageOptimizer';
import {
  isViableDraft,
  wrapSelectionAsCodeBlock,
} from '../editor/editorConfig';
import { apiService, MAX_ATTACHMENT_BYTES } from '../services/apiService';
import { CodeBlockView } from './CodeBlock';
import { TagInput, normalizeTag } from './TagInput';

// ---------------------------------------------------------------------------
// Setup lowlight (syntax highlighting for code blocks)
// ---------------------------------------------------------------------------

const lowlight = createLowlight(common);

// Custom CodeBlock extension: React NodeView (copy button) + contiguous wrap
const RichCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Alt-c': () => wrapSelectionAsCodeBlock(this.editor),
    };
  },
}).configure({ lowlight });

// ---------------------------------------------------------------------------
// Serialisation extensions (schema-only, no DOM / NodeView involvement)
//
// Used by generateHTML() to convert the ProseMirror JSON document to HTML
// using only renderHTML() rules — this path never touches the live editor
// DOM, so React NodeView artefacts (e.g. the "Copy" button rendered by
// CodeBlockView) are completely excluded from the stored contentHtml.
//
// Placeholder is intentionally omitted: it is a pure UI decoration that adds
// no nodes or marks to the schema and has zero effect on HTML output.
// ---------------------------------------------------------------------------
const SERIALISATION_EXTENSIONS = [
  StarterKit.configure({ codeBlock: false }),
  RichCodeBlock,
  ImageExtension.configure({ inline: false, allowBase64: true }),
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MemoryEditorModalProps {
  /** Null means "create new memory". */
  memory: Memory | null;
  /** Current total number of memories (used to assign initial orderIndex). */
  nextOrderIndex: number;
  /** Existing tags across all memories (for datalist suggestions). */
  existingTags: string[];
  onSave: (memory: Memory) => Promise<void>;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  onClick,
  active,
  title,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`
      px-2 py-1 rounded text-sm font-medium transition-colors
      ${active
        ? 'bg-indigo-100 text-indigo-700'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }
    `}
  >
    {children}
  </button>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const MemoryEditorModal: React.FC<MemoryEditorModalProps> = ({
  memory,
  nextOrderIndex,
  existingTags,
  onSave,
  onClose,
}) => {
  // ---- Local form state ---------------------------------------------------

  const [title, setTitle] = useState(memory?.title ?? '');
  const [tags, setTags] = useState<string[]>(memory?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [colorTheme, setColorTheme] = useState<ColorTheme>(
    memory?.colorTheme ?? DEFAULT_COLOR_THEME,
  );
  const [attachments, setAttachments] = useState<MemoryAttachment[]>(
    memory?.attachments ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Refs
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const attachmentFileInputRef = useRef<HTMLInputElement>(null);
  // Stable ref to the latest image-insertion handler (avoids stale closure in
  // editor editorProps which is only evaluated once on creation)
  const insertImageRef = useRef<((file: File | Blob) => Promise<void>) | null>(null);

  // ---- TipTap editor ------------------------------------------------------

  const editor = useEditor({
    // Share the same extension set as SERIALISATION_EXTENSIONS so the schema
    // used by useEditor and by generateHTML() is always identical.
    extensions: [
      ...SERIALISATION_EXTENSIONS,
      Placeholder.configure({
        placeholder: 'Write your thought… paste an image, add code blocks…',
      }),
    ],
    content: memory?.contentHtml ?? '',
    editorProps: {
      // Handle paste events – intercept image items and optimise them
      handlePaste(_view, event) {
        const items = Array.from(event.clipboardData?.items ?? []);
        const imageItem = items.find((it) => it.type.startsWith('image/'));
        if (imageItem) {
          const file = imageItem.getAsFile();
          if (file) {
            void insertImageRef.current?.(file);
            return true; // Prevent default paste (which would insert raw PNG)
          }
        }
        return false;
      },
      // Handle file drop into the editor
      handleDrop(_view, event, _slice, moved) {
        if (moved) return false; // ProseMirror internal node move – allow default
        const files = Array.from(event.dataTransfer?.files ?? []);
        const imageFile = files.find((f) => f.type.startsWith('image/'));
        if (imageFile) {
          void insertImageRef.current?.(imageFile);
          return true;
        }
        return false;
      },
      attributes: {
        class: 'tiptap-content focus:outline-none min-h-[220px] px-1',
      },
    },
  });

  // Keep the image-insertion handler current whenever editor changes
  useEffect(() => {
    if (!editor) return;
    insertImageRef.current = async (file: File | Blob) => {
      try {
        setError(null);
        const optimised = await optimizeImage(file);
        const dataUrl   = await blobToDataUrl(optimised);
        editor.chain().focus().setImage({ src: dataUrl }).run();
      } catch (err) {
        setError(String(err));
      }
    };
  }, [editor]);

  // ---- Tag helpers --------------------------------------------------------

  const addTag = useCallback((raw: string) => {
    const tag = normalizeTag(raw);
    if (tag) {
      setTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    }
    setTagInput('');
  }, []);

  const removeTag = (tag: string) =>
    setTags((prev) => prev.filter((t) => t !== tag));

  // ---- Attachment helpers -------------------------------------------------

  const handleAttachmentPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    setError(null);

    for (const file of files) {
      try {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          throw new Error(
            `"${file.name}" exceeds the 1 MB attachment limit.`,
          );
        }
        const uploaded = await apiService.uploadAttachment(file);
        setAttachments((prev) => [...prev, uploaded]);
      } catch (err) {
        setError(String(err));
        return;
      }
    }
  };

  const removeAttachment = (id: string) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id));

  const downloadAttachment = (att: MemoryAttachment) => {
    if (att.data) {
      const blob =
        att.data instanceof Blob
          ? att.data
          : new Blob([att.data], { type: att.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return;
    }

    if (att.storedFilename) {
      const a = document.createElement('a');
      a.href = `/api/uploads/${encodeURIComponent(att.storedFilename)}`;
      a.download = att.name;
      a.click();
    }
  };

  // ---- Draft collection / save --------------------------------------------

  /**
   * Snapshot the current form + editor into a Memory record.
   * Pending tag-input text is folded in so a backdrop click does not drop it.
   * Returns null when the TipTap instance is not yet ready.
   */
  const collectDraft = (): { memory: Memory; viable: boolean } | null => {
    if (!editor) return null;

    // generateHTML uses only renderHTML() rules (pure schema path) so React
    // NodeView artefacts such as the "Copy" button are never stored.
    const contentHtml = generateHTML(editor.getJSON(), SERIALISATION_EXTENSIONS);
    const scratch = document.createElement('div');
    scratch.innerHTML = contentHtml;
    const contentText = scratch.textContent?.replace(/\s+/g, ' ').trim() ?? '';

    const pending = normalizeTag(tagInput);
    const finalTags =
      pending && !tags.includes(pending) ? [...tags, pending] : tags;

    const now = Date.now();
    const titleTrimmed = title.trim();

    return {
      viable: isViableDraft(titleTrimmed, contentText, attachments.length),
      memory: {
        id: memory?.id ?? crypto.randomUUID(),
        title: titleTrimmed || 'Untitled',
        contentHtml,
        contentText,
        tags: finalTags,
        colorTheme,
        isPinned: memory?.isPinned ?? false,
        orderIndex: memory?.orderIndex ?? nextOrderIndex,
        attachments,
        createdAt: memory?.createdAt ?? now,
        updatedAt: now,
      },
    };
  };

  const persistDraft = async (draft: Memory): Promise<boolean> => {
    setError(null);
    setIsSaving(true);
    try {
      await apiService.saveMemory(draft);
      await onSave(draft);
      return true;
    } catch (err) {
      setError(`Failed to save: ${String(err)}`);
      setIsSaving(false);
      return false;
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Please enter a title for this memory.');
      return;
    }
    const snapshot = collectDraft();
    if (!snapshot) return;
    await persistDraft(snapshot.memory);
  };

  /**
   * Backdrop click: persist when the draft is viable, otherwise close without
   * storing a blank note.  Parent onSave already closes the modal on success.
   */
  const handleBackdropClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (isSaving) return;

    const snapshot = collectDraft();
    if (!snapshot?.viable) {
      onClose();
      return;
    }
    await persistDraft(snapshot.memory);
  };

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // ---- Render -------------------------------------------------------------

  const theme = THEME_CLASSES[colorTheme];

  return (
    /* Backdrop */
    <div
      data-testid="editor-backdrop"
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center overflow-y-auto py-8 px-4"
      onClick={handleBackdropClick}
    >
      {/* Modal panel */}
      <div className={`
        w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col overflow-hidden
        border-2 ${theme.card.split(' ').find(c => c.startsWith('border-')) ?? 'border-gray-200'}
        bg-white
      `}>

        {/* ================================================================
            Header – title input + close
            ================================================================ */}
        <div className={`flex items-center gap-3 px-5 py-4 border-b border-gray-100 ${theme.accent}`}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Memory title…"
            autoFocus
            className="flex-1 text-lg font-semibold bg-transparent text-gray-800 placeholder-gray-400 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none transition-colors"
            title="Close (Esc)"
          >
            ×
          </button>
        </div>

        {/* ================================================================
            Toolbar
            ================================================================ */}
        <div className="flex flex-wrap items-center gap-0.5 px-4 py-2 border-b border-gray-100 bg-gray-50">
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleBold().run()}
            active={editor?.isActive('bold')}
            title="Bold (Ctrl+B)"
          >
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            active={editor?.isActive('italic')}
            title="Italic (Ctrl+I)"
          >
            <em>I</em>
          </ToolbarButton>

          <div className="w-px h-5 bg-gray-200 mx-1" />

          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor?.isActive('heading', { level: 1 })}
            title="Heading 1"
          >
            H1
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor?.isActive('heading', { level: 2 })}
            title="Heading 2"
          >
            H2
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor?.isActive('heading', { level: 3 })}
            title="Heading 3"
          >
            H3
          </ToolbarButton>

          <div className="w-px h-5 bg-gray-200 mx-1" />

          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            active={editor?.isActive('bulletList')}
            title="Bullet list"
          >
            • List
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            active={editor?.isActive('orderedList')}
            title="Ordered list"
          >
            1. List
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            active={editor?.isActive('blockquote')}
            title="Blockquote"
          >
            ❝
          </ToolbarButton>

          <div className="w-px h-5 bg-gray-200 mx-1" />

          <ToolbarButton
            onClick={() => editor && wrapSelectionAsCodeBlock(editor)}
            active={editor?.isActive('codeBlock')}
            title="Code block (Ctrl+Alt+C) — wraps the whole selection"
          >
            &lt;/&gt;
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleCode().run()}
            active={editor?.isActive('code')}
            title="Inline code"
          >
            `code`
          </ToolbarButton>

          <div className="w-px h-5 bg-gray-200 mx-1" />

          {/* Image picker button */}
          <ToolbarButton
            onClick={() => imageFileInputRef.current?.click()}
            title="Insert image"
          >
            🖼
          </ToolbarButton>
          <input
            ref={imageFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) await insertImageRef.current?.(file);
            }}
          />
        </div>

        {/* ================================================================
            Editor body (scrollable)
            ================================================================ */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-4">
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* ================================================================
            Metadata section
            ================================================================ */}
        <div className="border-t border-gray-100 px-5 py-4 space-y-4 bg-gray-50/50">

          {/* ---- Colour theme picker ------------------------------------- */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Card colour
            </p>
            <div className="flex flex-wrap gap-2">
              {COLOR_THEME_OPTIONS.map((t) => {
                const cls = THEME_CLASSES[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setColorTheme(t)}
                    title={cls.label}
                    className={`
                      w-8 h-8 rounded-full border-2 transition-all
                      ${cls.dot}
                      ${colorTheme === t
                        ? 'border-gray-600 scale-125 shadow-md'
                        : 'border-transparent hover:scale-110'
                      }
                    `}
                  />
                );
              })}
              <span className="self-center text-xs text-gray-500 ml-1">
                {THEME_CLASSES[colorTheme].label}
              </span>
            </div>
          </div>

          <TagInput
            tags={tags}
            inputValue={tagInput}
            onInputChange={setTagInput}
            existingTags={existingTags}
            onAddTag={addTag}
            onRemoveTag={removeTag}
          />

          {/* ---- Auxiliary attachments ----------------------------------- */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Attachments <span className="font-normal normal-case">(max 1 MB per file)</span>
            </p>

            {attachments.length > 0 && (
              <ul className="space-y-1.5 mb-3">
                {attachments.map((att) => (
                  <li
                    key={att.id}
                    className="flex items-center gap-2 text-sm bg-white border border-gray-200 rounded-lg px-3 py-2"
                  >
                    <span className="text-base">📄</span>
                    <span className="flex-1 truncate text-gray-700">{att.name}</span>
                    <span className="text-xs text-gray-400 shrink-0">{formatBytes(att.size)}</span>
                    <button
                      type="button"
                      onClick={() => downloadAttachment(att)}
                      className="text-indigo-500 hover:text-indigo-700 text-xs px-1"
                      title="Download attachment"
                    >
                      ⬇
                    </button>
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.id)}
                      className="text-red-400 hover:text-red-600 text-xs px-1"
                      title="Remove attachment"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              onClick={() => attachmentFileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
            >
              📎 Attach file…
            </button>
            <input
              ref={attachmentFileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleAttachmentPick}
            />
          </div>
        </div>

        {/* ================================================================
            Error banner
            ================================================================ */}
        {error && (
          <div className="mx-5 mb-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* ================================================================
            Footer – actions
            ================================================================ */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-100 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 text-sm font-semibold bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-300 text-white rounded-lg shadow-sm transition-colors"
          >
            {isSaving ? 'Saving…' : '💾 Save Memory'}
          </button>
        </div>
      </div>
    </div>
  );
};
