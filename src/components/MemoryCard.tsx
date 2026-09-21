// =============================================================================
// Memory Board – MemoryCard Component
//
// Renders a single "thought bubble" card in the board grid.
//
// Click interactions:
//   • Clicking anywhere on the card body → opens MemoryDetailModal (onView)
//   • Pin / Edit / Delete buttons → e.stopPropagation() prevents the card
//     body click from firing, then handle their own action
//
// Drag-and-drop:
//   The card element is `draggable`. onDragStart/Over/Drop are still wired to
//   the root div; drag operations do NOT fire onClick because the browser only
//   dispatches a click if there is negligible mouse movement between mousedown
//   and mouseup.
//
// Visual layout:
//   ┌─────────────────────────────────────┐
//   │ [📌] Title               [📍✏️🗑️]   │
//   │ Content preview (4 lines)           │
//   │ #tag1 #tag2                         │
//   │ 📎 2 attachments                    │
//   │ ─────────────────────────────────── │
//   │ Updated: Sep 18, 2026               │
//   └─────────────────────────────────────┘
// =============================================================================

import React, { useState } from 'react';
import type { Memory } from '../types/memory';
import { resolveMemoryTheme } from '../types/memory';

interface MemoryCardProps {
  memory: Memory;
  /** Opens the read-only MemoryDetailModal. */
  onView: () => void;
  /** Opens the MemoryEditorModal pre-filled with this memory. */
  onEdit: () => void;
  onDelete: () => void;
  onPin: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

/** Formats a Unix timestamp to a short, locale-aware date string. */
const formatDate = (ts: number): string =>
  new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

export const MemoryCard: React.FC<MemoryCardProps> = ({
  memory,
  onView,
  onEdit,
  onDelete,
  onPin,
  onDragStart,
  onDragOver,
  onDrop,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const themeId = resolveMemoryTheme(memory.colorTheme);

  // ---------------------------------------------------------------------------
  // Drag-and-drop handlers (augment parent handlers with local visual state)
  // ---------------------------------------------------------------------------

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    onDragStart(e);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
    onDragOver(e);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    onDrop(e);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    /*
     * The card root div is both the drag source AND the click target.
     * onClick fires onView to open the detail modal.
     * All action buttons call e.stopPropagation() before their own handler so
     * they do not accidentally trigger the card body click (onView).
     */
    <div
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onView}
      role="button"
      tabIndex={0}
      aria-label={`View memory: ${memory.title || 'Untitled'}`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onView(); }}
      data-theme={themeId}
      className={`
        memory-card relative flex flex-col p-4
        cursor-pointer select-none
        transition-transform duration-200
        ${isDragOver
          ? 'ring-2 ring-indigo-400 ring-offset-2 scale-[0.97]'
          : 'hover:scale-[1.01]'
        }
        ${memory.isPinned
          ? 'ring-2 ring-yellow-400 ring-offset-1'
          : ''
        }
      `}
    >
      {/* ---- Pin badge ---------------------------------------------------- */}
      {memory.isPinned && (
        <div
          className="absolute -top-2.5 -right-2.5 text-lg drop-shadow-sm"
          title="Pinned to top"
        >
          📌
        </div>
      )}

      {/* ---- Header: title + actions -------------------------------------- */}
      <div className="flex items-start gap-2 mb-2">
        <h3 className="memory-card-title flex-1 font-semibold text-sm leading-snug line-clamp-2">
          {memory.title || (
            <span className="italic opacity-60">Untitled</span>
          )}
        </h3>

        {/*
         * Action buttons – e.stopPropagation() on every button ensures that
         * clicking them does NOT bubble up to the card root's onClick (onView).
         */}
        <div className="flex gap-0.5 shrink-0 -mt-0.5 theme-header-fg">
          <button
            onClick={(e) => { e.stopPropagation(); onPin(); }}
            className="p-1.5 rounded-lg hover:bg-black/10 transition-colors text-sm"
            title={memory.isPinned ? 'Unpin memory' : 'Pin to top'}
          >
            {memory.isPinned ? '📌' : '📍'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1.5 rounded-lg hover:bg-black/10 transition-colors text-sm"
            title="Edit memory"
          >
            ✏️
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 rounded-lg hover:bg-black/10 transition-colors text-sm"
            title="Delete memory"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* ---- Content preview (plain text, max 4 lines) ------------------- */}
      {memory.contentText.trim() && (
        <p className="memory-card-body flex-1 text-xs leading-relaxed line-clamp-4 mb-2">
          {memory.contentText}
        </p>
      )}

      {/* ---- Tags --------------------------------------------------------- */}
      {memory.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {memory.tags.map((tag) => (
            <span
              key={tag}
              className="memory-card-tag px-2 py-0.5 rounded-full text-xs font-medium"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* ---- Attachments indicator ---------------------------------------- */}
      {memory.attachments.length > 0 && (
        <p className="memory-card-meta text-xs mb-2">
          📎 {memory.attachments.length}{' '}
          {memory.attachments.length === 1 ? 'attachment' : 'attachments'}
        </p>
      )}

      {/* ---- Footer: last-updated date ------------------------------------ */}
      <div className="memory-card-meta text-xs border-t border-current/10 pt-2 mt-auto">
        {formatDate(memory.updatedAt)}
      </div>
    </div>
  );
};
