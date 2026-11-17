import React, { useEffect, useRef, useState } from 'react';

interface SettingsMenuProps {
  onImport: (file: File) => void;
  onExport: () => void;
  onEditTags: () => void;
  onLogout: () => void;
}

export const SettingsMenu: React.FC<SettingsMenuProps> = ({
  onImport,
  onExport,
  onEditTags,
  onLogout,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-800 font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm text-sm"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Settings
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-44 rounded-xl border border-gray-200 bg-white py-1 shadow-lg z-40"
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => choose(() => importInputRef.current?.click())}
          >
            Import
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => choose(onExport)}
          >
            Export
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => choose(onEditTags)}
          >
            Edit Tags
          </button>
          <div className="my-1 border-t border-gray-100" />
          <button
            type="button"
            role="menuitem"
            className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => choose(onLogout)}
          >
            Log out
          </button>
        </div>
      )}
      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImport(file);
          event.target.value = '';
        }}
      />
    </div>
  );
};
