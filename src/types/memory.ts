// =============================================================================
// Memory Board – Core Type Definitions
// =============================================================================

/** A file attached to a memory (non-image auxiliary file). */
export interface MemoryAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  /**
   * Raw binary data when the file is held locally (IndexedDB / ZIP import).
   * Omitted for attachments uploaded to the server (`storedFilename` is set).
   */
  data?: Blob | ArrayBuffer;
  /** Server-side filename under /api/uploads/ after a successful upload. */
  storedFilename?: string;
}

/** Visual motif applied to a memory card. */
export type MemoryTheme =
  | 'note-paper'
  | 'thought-bubble'
  | 'blueprint'
  | 'terminal'
  | 'supermarket'
  | 'storefront';

/**
 * Historical alias.  Stored `colorTheme` values may still be a MemoryTheme
 * or a legacy pastel-* string — use `resolveMemoryTheme()` at read time.
 */
export type ColorTheme = MemoryTheme;

/** Sort modes for the board grid. */
export type SortMode =
  | 'custom'        // Manual drag-and-drop order (orderIndex)
  | 'created-asc'   // Oldest first
  | 'created-desc'  // Newest first
  | 'updated-desc'  // Recently updated first
  | 'alpha-asc';    // A → Z by title

/** A single memory (thought bubble) stored in the board. */
export interface Memory {
  id: string;
  title: string;
  /** Full HTML content – may contain embedded images as data-URLs. */
  contentHtml: string;
  /** Plaintext extracted from contentHtml; used for full-text search. */
  contentText: string;
  tags: string[];
  colorTheme: ColorTheme;
  isPinned: boolean;
  /** Used for manual drag-and-drop ordering (lower = earlier in grid). */
  orderIndex: number;
  /** Auxiliary file attachments (not the inline editor images). */
  attachments: MemoryAttachment[];
  /** Unix timestamp (ms) */
  createdAt: number;
  /** Unix timestamp (ms) */
  updatedAt: number;
}

export const MEMORY_THEME_OPTIONS: MemoryTheme[] = [
  'note-paper',
  'thought-bubble',
  'blueprint',
  'terminal',
  'supermarket',
  'storefront',
];

/** Ordered list of colour themes for UI iteration. */
export const COLOR_THEME_OPTIONS: MemoryTheme[] = MEMORY_THEME_OPTIONS;

const LEGACY_PASTEL_THEMES = new Set([
  'pastel-pink',
  'pastel-blue',
  'pastel-green',
  'pastel-yellow',
  'pastel-purple',
  'pastel-peach',
]);

/** Map stored / imported theme strings onto a supported MemoryTheme. */
export const resolveMemoryTheme = (value: unknown): MemoryTheme => {
  if (typeof value === 'string' && (MEMORY_THEME_OPTIONS as string[]).includes(value)) {
    return value as MemoryTheme;
  }
  if (typeof value === 'string' && LEGACY_PASTEL_THEMES.has(value)) {
    return 'note-paper';
  }
  return 'note-paper';
};

export const isMemoryTheme = (value: unknown): value is MemoryTheme =>
  typeof value === 'string' && (MEMORY_THEME_OPTIONS as string[]).includes(value);

// =============================================================================
// UI helpers – theme chrome (modal accents + picker labels)
// =============================================================================

export interface ThemeClasses {
  /** Classes applied to the card root div (background + border). */
  card: string;
  /** Lighter accent shade, e.g. for section backgrounds in the modal. */
  accent: string;
  /** Small preview tile for the theme picker. */
  swatch: string;
  /** Human-readable label with emoji. */
  label: string;
}

export const THEME_CLASSES: Record<MemoryTheme, ThemeClasses> = {
  'note-paper': {
    card: 'memory-card',
    accent: 'bg-[#fef9e7]',
    swatch: 'theme-swatch',
    label: '📝 Torn note',
  },
  'thought-bubble': {
    card: 'memory-card',
    accent: 'bg-[#f7fbff]',
    swatch: 'theme-swatch',
    label: '💭 Thought bubble',
  },
  blueprint: {
    card: 'memory-card',
    accent: 'bg-[#0b2b48]',
    swatch: 'theme-swatch',
    label: '📐 Blueprint',
  },
  terminal: {
    card: 'memory-card',
    accent: 'bg-[#0d1117]',
    swatch: 'theme-swatch',
    label: '🖥️ CRT terminal',
  },
  supermarket: {
    card: 'memory-card',
    accent: 'bg-[#fffdf6]',
    swatch: 'theme-swatch',
    label: '🛒 Supermarket',
  },
  storefront: {
    card: 'memory-card',
    accent: 'bg-[#16122b]',
    swatch: 'theme-swatch',
    label: '🛍️ Online shop',
  },
};
