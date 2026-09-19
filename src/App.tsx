// =============================================================================
// Memory Board – Root Application Component
//
// State ownership:
//   memories[]     – hydrated from the PHP API via apiService, with IndexedDB fallback.
//   detailMemory   – the memory shown in the read-only MemoryDetailModal (null = hidden).
//   editorOpen     – whether the MemoryEditorModal is visible.
//   editingMemory  – the memory being edited (null = create new).
//   sortMode       – board sort order; switches to 'custom' after a drag-reorder.
//   searchQuery    – full-text search string.
//   activeTagFilters – multi-select tag filter array.
//
// Modal transitions:
//   Card click → detailMemory = memory     (open detail view)
//   Detail "Edit" → detailMemory = null,   (close detail, open editor)
//                   editorOpen = true
//   Detail "×" / Esc → detailMemory = null (close detail)
//   Editor save/close → editorOpen = false (close editor)
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Board, filterMemories, sortMemories } from './components/Board';
import { FilterBar } from './components/FilterBar';
import { MemoryEditorModal } from './components/MemoryEditorModal';
import { MemoryDetailModal } from './components/MemoryDetailModal';
import { updateMemoryOrder } from './services/database';
import { apiService } from './services/apiService';
import { exportBackup, importBackup } from './services/exportImportService';
import type { Memory, SortMode } from './types/memory';

const App: React.FC = () => {
  // ---- Core state ---------------------------------------------------------
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // ---- Detail modal state -------------------------------------------------
  const [detailMemory, setDetailMemory] = useState<Memory | null>(null);

  // ---- Editor modal state -------------------------------------------------
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);

  // ---- Board state --------------------------------------------------------
  const [sortMode, setSortMode] = useState<SortMode>('custom');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
  const [sessionUsername, setSessionUsername] = useState<string | null>(
    apiService.currentUsername,
  );

  // ---- Load from API (IndexedDB fallback) ---------------------------------

  const loadMemories = useCallback(async () => {
    try {
      setIsLoading(true);
      const loaded = await apiService.getMemories();
      setMemories(loaded);
    } catch (err) {
      setGlobalError(`Failed to load memories: ${String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMemories();
  }, [loadMemories]);

  useEffect(() => {
    return apiService.subscribe(() => {
      const name = apiService.currentUsername;
      setSessionUsername(name);
      if (!name) {
        setMemories([]);
        setDetailMemory(null);
        setEditorOpen(false);
        setEditingMemory(null);
        return;
      }
      void loadMemories();
    });
  }, [loadMemories]);

  // ---- CRUD handlers ------------------------------------------------------

  const handleSaveMemory = useCallback(
    async (_memory: Memory) => {
      // Editor already persisted via apiService.saveMemory(); refresh from
      // the API (or IndexedDB fallback) so the board matches the server.
      await loadMemories();
      setEditorOpen(false);
      setEditingMemory(null);
    },
    [loadMemories],
  );

  const handleDeleteMemory = useCallback((id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
    setDetailMemory((current) => (current?.id === id ? null : current));
  }, []);

  const handlePinToggle = useCallback((updated: Memory) => {
    setMemories((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  }, []);

  const handleReorder = useCallback(async (reordered: Memory[]) => {
    // Assign sequential orderIndex values from the new array order
    const withIndex = reordered.map((m, i) => ({ ...m, orderIndex: i }));
    setMemories((prev) => {
      // Merge: re-indexed cards + any cards not in the reordered set (filtered out)
      const map = new Map(withIndex.map((m) => [m.id, m]));
      return prev.map((m) => map.get(m.id) ?? m);
    });
    setSortMode('custom');

    try {
      await Promise.all(withIndex.map((m) => apiService.saveMemory(m)));
      await updateMemoryOrder(withIndex.map((m) => ({ id: m.id, orderIndex: m.orderIndex })));
    } catch (err) {
      setGlobalError(`Reorder failed: ${String(err)}`);
    }
  }, []);

  // ---- Detail modal helpers -----------------------------------------------

  /** Opens the read-only detail view for a card click. */
  const handleViewMemory = useCallback((memory: Memory) => {
    setDetailMemory(memory);
  }, []);

  /** Called by MemoryDetailModal's 'close' event → clears detailMemory. */
  const handleDetailClose = useCallback(() => {
    setDetailMemory(null);
  }, []);

  /**
   * Called when the user clicks "Edit" inside MemoryDetailModal.
   * The detail modal closes itself (via dialog.close() → close event → handleDetailClose),
   * so here we only need to open the editor.  React 18 batches both state
   * changes into a single render cycle.
   */
  const handleEditFromDetail = useCallback((memory: Memory) => {
    setEditorOpen(true);
    setEditingMemory(memory);
  }, []);

  // ---- Editor helpers -----------------------------------------------------

  const openEditorFor = (memory?: Memory) => {
    setEditingMemory(memory ?? null);
    setEditorOpen(true);
  };

  // ---- Export / Import ----------------------------------------------------

  const handleExport = async () => {
    try {
      setGlobalError(null);
      await exportBackup();
    } catch (err) {
      setGlobalError(`Export failed: ${String(err)}`);
    }
  };

  const handleImport = async (file: File) => {
    try {
      setGlobalError(null);
      const { count } = await importBackup(file);
      await loadMemories();
      window.alert(`✅ Restored ${count} ${count === 1 ? 'memory' : 'memories'} successfully.`);
    } catch (err) {
      setGlobalError(`Import failed: ${String(err)}`);
    }
  };

  // ---- Derived values -----------------------------------------------------

  /** Unique sorted list of all tags across all memories. */
  const allTags = useMemo(
    () => Array.from(new Set(memories.flatMap((m) => m.tags))).sort(),
    [memories],
  );

  /** Count of cards currently visible after filters (for the FilterBar). */
  const filteredCount = useMemo(() => {
    const sorted = sortMemories(memories, sortMode);
    return filterMemories(sorted, searchQuery, activeTagFilters).length;
  }, [memories, sortMode, searchQuery, activeTagFilters]);

  // ---- Render -------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/30">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          {/* Logotype */}
          <div className="flex items-center gap-2">
            <span className="text-2xl">🧠</span>
            <span className="text-xl font-bold tracking-tight text-gray-800">
              Memory Board
            </span>
          </div>

          {/* Memory count badge */}
          <span className="text-xs text-gray-400 font-medium hidden sm:block">
            {memories.length} {memories.length === 1 ? 'memory' : 'memories'}
          </span>

          {/* Session + new memory */}
          <div className="flex items-center gap-3">
            {sessionUsername && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 hidden sm:inline">
                  Signed in as <strong className="font-semibold text-gray-800">{sessionUsername}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => { void apiService.logout(); }}
                  className="text-sm font-medium text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  aria-label={`Log out ${sessionUsername}`}
                >
                  Log Out
                </button>
              </div>
            )}
            <button
              onClick={() => openEditorFor()}
              className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm text-sm"
            >
              <span className="text-base leading-none">+</span>
              New Memory
            </button>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Main content                                                        */}
      {/* ------------------------------------------------------------------ */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Global error banner */}
        {globalError && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-3">
            <span className="text-base">⚠️</span>
            <span className="flex-1">{globalError}</span>
            <button
              onClick={() => setGlobalError(null)}
              className="text-red-400 hover:text-red-600"
            >
              ×
            </button>
          </div>
        )}

        {/* Filter controls */}
        <FilterBar
          sortMode={sortMode}
          onSortChange={setSortMode}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          allTags={allTags}
          activeTagFilters={activeTagFilters}
          onTagFilterChange={setActiveTagFilters}
          onExport={handleExport}
          onImport={handleImport}
          totalCount={memories.length}
          filteredCount={filteredCount}
        />

        {/* Board grid */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
            <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
            <p className="text-sm">Loading memories…</p>
          </div>
        ) : (
          <Board
            memories={memories}
            sortMode={sortMode}
            searchQuery={searchQuery}
            activeTagFilters={activeTagFilters}
            onView={handleViewMemory}
            onEdit={openEditorFor}
            onDelete={handleDeleteMemory}
            onPin={handlePinToggle}
            onReorder={handleReorder}
            onSortChange={setSortMode}
          />
        )}
      </main>

      {/* ------------------------------------------------------------------ */}
      {/* Detail modal – read-only inspection view                            */}
      {/* ------------------------------------------------------------------ */}
      {detailMemory && (
        <MemoryDetailModal
          memory={detailMemory}
          onClose={handleDetailClose}
          onEdit={handleEditFromDetail}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Editor modal – create / update                                      */}
      {/* ------------------------------------------------------------------ */}
      {editorOpen && (
        <MemoryEditorModal
          memory={editingMemory}
          nextOrderIndex={memories.length}
          existingTags={allTags}
          onSave={handleSaveMemory}
          onClose={() => {
            setEditorOpen(false);
            setEditingMemory(null);
          }}
        />
      )}
    </div>
  );
};

export default App;
