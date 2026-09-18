// =============================================================================
// Memory Board – FilterBar Component
//
// Sticky controls bar rendered above the board grid. Contains:
//   • Full-text search input (real-time)
//   • Sort-mode dropdown (delegates switch to 'custom' automatically after drag)
//   • Export / Import buttons (wired to exportImportService)
//   • Tag filter chip cloud (multi-select; all chips active = no filter)
// =============================================================================

import React, { useRef } from 'react';
import type { SortMode } from '../types/memory';

interface FilterBarProps {
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  allTags: string[];
  activeTagFilters: string[];
  onTagFilterChange: (tags: string[]) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  totalCount: number;
  filteredCount: number;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  sortMode,
  onSortChange,
  searchQuery,
  onSearchChange,
  allTags,
  activeTagFilters,
  onTagFilterChange,
  onExport,
  onImport,
  totalCount,
  filteredCount,
}) => {
  // Hidden file input for the import flow
  const importInputRef = useRef<HTMLInputElement>(null);

  const toggleTag = (tag: string) => {
    if (activeTagFilters.includes(tag)) {
      onTagFilterChange(activeTagFilters.filter((t) => t !== tag));
    } else {
      onTagFilterChange([...activeTagFilters, tag]);
    }
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImport(file);
      // Reset so the same file can be selected again later
      e.target.value = '';
    }
  };

  const isFiltered =
    searchQuery.trim() !== '' || activeTagFilters.length > 0;

  return (
    <div className="mb-6 space-y-3">
      {/* ---- Row 1: search + sort + export/import ------------------------- */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search titles and content…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {/* Sort mode */}
        <select
          value={sortMode}
          onChange={(e) => onSortChange(e.target.value as SortMode)}
          className="py-2 px-3 text-sm border border-gray-200 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition"
        >
          <option value="custom">✋ Custom order</option>
          <option value="created-desc">🕐 Newest first</option>
          <option value="created-asc">🕐 Oldest first</option>
          <option value="updated-desc">✏️ Recently updated</option>
          <option value="alpha-asc">🔤 A → Z</option>
        </select>

        {/* Export */}
        <button
          onClick={onExport}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50 shadow-sm transition"
          title="Export all memories as a ZIP backup"
        >
          ⬇ Export
        </button>

        {/* Import */}
        <button
          onClick={() => importInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50 shadow-sm transition"
          title="Restore memories from a ZIP backup (replaces current data)"
        >
          ⬆ Import
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept=".zip"
          onChange={handleImportFileChange}
          className="hidden"
        />
      </div>

      {/* ---- Row 2: tag chips + result count ------------------------------ */}
      <div className="flex flex-wrap items-center gap-2">
        {allTags.map((tag) => (
          <button
            key={tag}
            onClick={() => toggleTag(tag)}
            className={`
              px-3 py-0.5 rounded-full text-xs font-medium transition-colors
              ${activeTagFilters.includes(tag)
                ? 'bg-indigo-500 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }
            `}
          >
            #{tag}
          </button>
        ))}

        {activeTagFilters.length > 0 && (
          <button
            onClick={() => onTagFilterChange([])}
            className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
          >
            Clear filters
          </button>
        )}

        {/* Result counter */}
        {isFiltered && (
          <span className="ml-auto text-xs text-gray-400">
            {filteredCount} / {totalCount} shown
          </span>
        )}
      </div>
    </div>
  );
};
