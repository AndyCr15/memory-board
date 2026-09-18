// =============================================================================
// Memory Board – Core Type Definitions
// =============================================================================

/** A file attached to a memory (non-image auxiliary file). */
export interface MemoryAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  /** Raw binary data. Stored as Blob in IndexedDB; may arrive as ArrayBuffer
   *  from ZIP import before being normalised. */
  data: Blob | ArrayBuffer;
}

/** The six pastel colour themes available for a memory card. */
export type ColorTheme =
  | 'pastel-pink'
  | 'pastel-blue'
  | 'pastel-green'
  | 'pastel-yellow'
  | 'pastel-purple'
  | 'pastel-peach';

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

// =============================================================================
// UI helpers – colour-theme → Tailwind class mapping
// =============================================================================

export interface ThemeClasses {
  /** Classes applied to the card root div (background + border). */
  card: string;
  /** Lighter accent shade, e.g. for section backgrounds in the modal. */
  accent: string;
  /** Small dot colour for the colour-picker swatch. */
  dot: string;
  /** Human-readable label with emoji. */
  label: string;
}

export const THEME_CLASSES: Record<ColorTheme, ThemeClasses> = {
  'pastel-pink': {
    card: 'bg-rose-50 border-rose-200 hover:border-rose-300',
    accent: 'bg-rose-100',
    dot: 'bg-rose-400',
    label: '🌸 Pink',
  },
  'pastel-blue': {
    card: 'bg-sky-50 border-sky-200 hover:border-sky-300',
    accent: 'bg-sky-100',
    dot: 'bg-sky-400',
    label: '💙 Blue',
  },
  'pastel-green': {
    card: 'bg-emerald-50 border-emerald-200 hover:border-emerald-300',
    accent: 'bg-emerald-100',
    dot: 'bg-emerald-400',
    label: '🌿 Green',
  },
  'pastel-yellow': {
    card: 'bg-yellow-50 border-yellow-200 hover:border-yellow-300',
    accent: 'bg-yellow-100',
    dot: 'bg-yellow-400',
    label: '✨ Yellow',
  },
  'pastel-purple': {
    card: 'bg-purple-50 border-purple-200 hover:border-purple-300',
    accent: 'bg-purple-100',
    dot: 'bg-purple-400',
    label: '💜 Purple',
  },
  'pastel-peach': {
    card: 'bg-orange-50 border-orange-200 hover:border-orange-300',
    accent: 'bg-orange-100',
    dot: 'bg-orange-400',
    label: '🍑 Peach',
  },
};

/** Ordered list of colour themes for UI iteration. */
export const COLOR_THEME_OPTIONS: ColorTheme[] = [
  'pastel-pink',
  'pastel-blue',
  'pastel-green',
  'pastel-yellow',
  'pastel-purple',
  'pastel-peach',
];
