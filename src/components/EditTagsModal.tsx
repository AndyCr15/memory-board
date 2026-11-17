import React, { useState } from 'react';
import { normalizeTag } from './TagInput';

interface EditTagsModalProps {
  tags: string[];
  onClose: () => void;
  onRename: (from: string, to: string) => Promise<void>;
}

export const EditTagsModal: React.FC<EditTagsModalProps> = ({
  tags,
  onClose,
  onRename,
}) => {
  const [selected, setSelected] = useState(tags[0] ?? '');
  const [nextName, setNextName] = useState(tags[0] ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const chooseTag = (tag: string) => {
    setSelected(tag);
    setNextName(tag);
    setError(null);
  };

  const save = async () => {
    const to = normalizeTag(nextName);
    if (!selected) {
      setError('Choose a tag to edit.');
      return;
    }
    if (!to) {
      setError('Enter a new name.');
      return;
    }
    if (to === selected) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onRename(selected, to);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename that tag.');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="edit-tags-title"
        className="w-full max-w-md bg-white rounded-xl shadow-2xl p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 id="edit-tags-title" className="text-lg font-semibold text-gray-800">
            Edit tags
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-2xl leading-none text-gray-400 hover:text-gray-700"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {tags.length === 0 ? (
          <p className="text-sm text-gray-500">No tags yet.</p>
        ) : (
          <div className="space-y-3">
            <label className="block text-sm text-gray-600">
              Tag
              <select
                value={selected}
                onChange={(event) => chooseTag(event.target.value)}
                className="mt-1 w-full py-2 px-3 text-sm border border-gray-200 rounded-lg bg-white"
              >
                {tags.map((tag) => (
                  <option key={tag} value={tag}>
                    #{tag}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-gray-600">
              New name
              <input
                type="text"
                value={nextName}
                onChange={(event) => setNextName(event.target.value)}
                className="mt-1 w-full py-2 px-3 text-sm border border-gray-200 rounded-lg"
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void save(); }}
                disabled={saving}
                className="px-3 py-1.5 text-sm font-semibold text-white bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-300 rounded-lg"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
