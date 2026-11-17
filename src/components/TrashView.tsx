import React from 'react';
import type { Memory } from '../types/memory';

interface TrashViewProps {
  memories: Memory[];
  onRestore: (memory: Memory) => void;
  onDeletePermanent: (memory: Memory) => void;
  onEmpty: () => void;
  onClose: () => void;
}

const formatDate = (ts: number): string =>
  new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const TrashView: React.FC<TrashViewProps> = ({
  memories,
  onRestore,
  onDeletePermanent,
  onEmpty,
  onClose,
}) => (
  <section className="max-w-3xl mx-auto">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">Trash</h2>
        <p className="text-sm text-gray-500">
          {memories.length === 0
            ? 'Nothing in Trash.'
            : `${memories.length} ${memories.length === 1 ? 'memory' : 'memories'} waiting to be restored or removed.`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {memories.length > 0 && (
          <button
            type="button"
            onClick={onEmpty}
            className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg"
          >
            Empty Trash
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg"
        >
          Back to board
        </button>
      </div>
    </div>

    {memories.length > 0 && (
      <ul className="space-y-2">
        {memories.map((memory) => (
          <li
            key={memory.id}
            className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-800 truncate">{memory.title || 'Untitled'}</p>
              {memory.deletedAt != null && (
                <p className="text-xs text-gray-400">Deleted {formatDate(memory.deletedAt)}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onRestore(memory)}
              className="px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={() => onDeletePermanent(memory)}
              className="px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 rounded-lg"
            >
              Delete permanently
            </button>
          </li>
        ))}
      </ul>
    )}
  </section>
);
