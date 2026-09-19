// =============================================================================
// Memory Board – Board Component
//
// Renders the masonry-style grid of MemoryCards.
//
// Sorting rules:
//   1. Pinned memories always appear before unpinned ones.
//   2. Within each group, the selected SortMode determines the order.
//   3. After a drag-and-drop, the parent switches sortMode to 'custom' so
//      manual orderIndex values take precedence.
//
// Drag-and-drop:
//   Uses the HTML5 Drag and Drop API.  dragId ref tracks the card being
//   dragged; dragOverId tracks the current drop target.  On drop, we splice
//   the dragged card into the target position in the sorted list and call
//   onReorder() with the updated array.
//
// Filtering:
//   Applied after sorting.  Both search query and tag filters run here so the
//   parent only needs to maintain the raw memories array.
// =============================================================================

import React, { useMemo, useRef } from 'react';
import { MemoryCard } from './MemoryCard';
import { apiService } from '../services/apiService';
import type { Memory, SortMode } from '../types/memory';

interface BoardProps {
  memories: Memory[];
  sortMode: SortMode;
  searchQuery: string;
  activeTagFilters: string[];
  /** Opens the read-only MemoryDetailModal for the clicked card. */
  onView: (memory: Memory) => void;
  onEdit: (memory: Memory) => void;
  onDelete: (id: string) => void;
  onPin: (memory: Memory) => void;
  /** Called with the fully re-ordered memories array after a drag-and-drop. */
  onReorder: (memories: Memory[]) => void;
  onSortChange: (mode: SortMode) => void;
}

// ---------------------------------------------------------------------------
// Pure sort + filter utilities
// ---------------------------------------------------------------------------

const comparator: Record<SortMode, (a: Memory, b: Memory) => number> = {
  custom:       (a, b) => a.orderIndex - b.orderIndex,
  'created-asc':  (a, b) => a.createdAt - b.createdAt,
  'created-desc': (a, b) => b.createdAt - a.createdAt,
  'updated-desc': (a, b) => b.updatedAt - a.updatedAt,
  'alpha-asc':    (a, b) => a.title.localeCompare(b.title),
};

/**
 * Sorts `memories` so pinned cards lead, then applies the SortMode within
 * each group (pinned / unpinned).
 */
const sortMemories = (memories: Memory[], mode: SortMode): Memory[] => {
  const cmp = comparator[mode];
  const pinned   = memories.filter((m) =>  m.isPinned).sort(cmp);
  const unpinned = memories.filter((m) => !m.isPinned).sort(cmp);
  return [...pinned, ...unpinned];
};

/**
 * Applies full-text search and tag filters.  Returns a subset of the input
 * array preserving the existing order.
 */
const filterMemories = (
  memories: Memory[],
  query: string,
  tagFilters: string[],
): Memory[] => {
  let result = memories;

  if (query.trim()) {
    const q = query.toLowerCase();
    result = result.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.contentText.toLowerCase().includes(q),
    );
  }

  if (tagFilters.length > 0) {
    // All selected tags must be present (AND logic)
    result = result.filter((m) =>
      tagFilters.every((t) => m.tags.includes(t)),
    );
  }

  return result;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Board: React.FC<BoardProps> = ({
  memories,
  sortMode,
  searchQuery,
  activeTagFilters,
  onView,
  onEdit,
  onDelete,
  onPin,
  onReorder,
  onSortChange,
}) => {
  // Refs for drag-and-drop source / target tracking
  const dragSourceId = useRef<string | null>(null);

  // Memoised sort → filter pipeline
  const sorted   = useMemo(() => sortMemories(memories, sortMode), [memories, sortMode]);
  const filtered = useMemo(
    () => filterMemories(sorted, searchQuery, activeTagFilters),
    [sorted, searchQuery, activeTagFilters],
  );

  // ---------------------------------------------------------------------------
  // Drag-and-drop handlers
  // ---------------------------------------------------------------------------

  const handleDragStart = (id: string) => (e: React.DragEvent) => {
    dragSourceId.current = id;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (_id: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (targetId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const sourceId = dragSourceId.current;
    if (!sourceId || sourceId === targetId) return;

    // Operate on the full sorted list (not just the filtered subset) to
    // preserve positions of cards that are filtered out
    const currentOrder = [...sorted];
    const fromIdx = currentOrder.findIndex((m) => m.id === sourceId);
    const toIdx   = currentOrder.findIndex((m) => m.id === targetId);

    if (fromIdx === -1 || toIdx === -1) return;

    // Splice the dragged card into the new position
    const reordered = [...currentOrder];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    dragSourceId.current = null;

    // Notify parent: it will persist new orderIndex values and switch to
    // 'custom' sort mode
    onReorder(reordered);
    onSortChange('custom');
  };

  const handleDelete = async (id: string) => {
    const target = memories.find((m) => m.id === id);
    const name = target?.title || 'this memory';
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await apiService.deleteMemory(id);
    onDelete(id);
  };

  const handlePin = async (memory: Memory) => {
    const updated: Memory = {
      ...memory,
      isPinned: !memory.isPinned,
      updatedAt: Date.now(),
    };
    await apiService.saveMemory(updated);
    onPin(updated);
  };

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  if (memories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-72 text-gray-400 space-y-3">
        <div className="text-6xl">🧠</div>
        <p className="text-lg font-semibold text-gray-500">No memories yet</p>
        <p className="text-sm">Click <strong>"+ New Memory"</strong> to create your first thought bubble.</p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-60 text-gray-400 space-y-2">
        <div className="text-5xl">🔍</div>
        <p className="text-base font-medium text-gray-500">No memories match your filters</p>
        <p className="text-sm">Try adjusting your search or tag selection.</p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Grid
  // ---------------------------------------------------------------------------

  return (
    <div
      className="grid w-full"
      style={{
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '1.25rem',
      }}
    >
      {filtered.map((memory) => (
        <MemoryCard
          key={memory.id}
          memory={memory}
          onView={() => onView(memory)}
          onEdit={() => onEdit(memory)}
          onDelete={() => { void handleDelete(memory.id); }}
          onPin={() => { void handlePin(memory); }}
          onDragStart={handleDragStart(memory.id)}
          onDragOver={handleDragOver(memory.id)}
          onDrop={handleDrop(memory.id)}
        />
      ))}
    </div>
  );
};

// Re-export count helpers so App can pass them to FilterBar
export { filterMemories, sortMemories };
