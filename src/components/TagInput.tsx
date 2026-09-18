// =============================================================================
// Memory Board – TagInput
//
// Chip list + text field with an autocomplete dropdown of existing tags.
//
// Selection uses `mousedown` + `preventDefault()` so the input does not blur
// (which would close the menu) before the suggestion is applied.  Duplicates
// are rejected by the parent `onAddTag` handler.
// =============================================================================

import React, { useMemo, useState } from 'react';

export const normalizeTag = (raw: string): string =>
  raw.trim().toLowerCase().replace(/\s+/g, '-');

interface TagInputProps {
  tags: string[];
  /** Controlled buffer for the text field (parent reads this on autosave). */
  inputValue: string;
  onInputChange: (value: string) => void;
  existingTags: string[];
  onAddTag: (raw: string) => void;
  onRemoveTag: (tag: string) => void;
}

export const TagInput: React.FC<TagInputProps> = ({
  tags,
  inputValue,
  onInputChange,
  existingTags,
  onAddTag,
  onRemoveTag,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const suggestions = useMemo(() => {
    const query = inputValue.trim().toLowerCase();
    return existingTags.filter((t) => {
      if (tags.includes(t)) return false;
      if (!query) return true;
      return t.includes(query);
    });
  }, [existingTags, tags, inputValue]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (inputValue.trim()) onAddTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      onRemoveTag(tags[tags.length - 1]);
    } else if (e.key === 'Escape') {
      setMenuOpen(false);
    }
  };

  const handleSuggestionMouseDown = (
    e: React.MouseEvent<HTMLButtonElement>,
    tag: string,
  ) => {
    // preventDefault stops the input from blurring, so the menu stays open
    // and the field keeps focus after the tag is appended.
    e.preventDefault();
    onAddTag(tag);
  };

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
        Tags
      </p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 px-2.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium"
          >
            #{tag}
            <button
              type="button"
              onClick={() => onRemoveTag(tag)}
              className="hover:text-indigo-900 leading-none"
              aria-label={`Remove tag ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            onInputChange(e.target.value);
            setMenuOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setMenuOpen(true)}
          onBlur={() => {
            if (inputValue.trim()) onAddTag(inputValue);
            setMenuOpen(false);
          }}
          placeholder="Add a tag… (Enter or comma to confirm)"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 transition"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={menuOpen && suggestions.length > 0}
        />
        {menuOpen && suggestions.length > 0 && (
          <ul
            role="listbox"
            className="absolute z-20 left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1"
          >
            {suggestions.map((tag) => (
              <li key={tag} role="option">
                <button
                  type="button"
                  onMouseDown={(e) => handleSuggestionMouseDown(e, tag)}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  #{tag}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
