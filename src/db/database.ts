// =============================================================================
// Memory Board – IndexedDB Layer (Dexie.js)
//
// Schema:
//   memories    – Memory metadata + rich-text content. Attachment blobs are
//                 stored in a separate table to keep record sizes manageable.
//   attachments – Raw file blobs linked to their parent memory by memoryId.
//
// Data flow:
//   saveMemory()    → writes MemoryRecord + AttachmentRecords in one transaction
//   getAllMemories() → joins both tables and returns hydrated Memory[]
//   deleteMemory()  → cascades delete to attachments
// =============================================================================

import Dexie, { type Table } from 'dexie';
import type { Memory, MemoryAttachment, ColorTheme } from '../types/memory';

// ---------------------------------------------------------------------------
// Internal DB record types (attachment blobs stored separately from memories)
// ---------------------------------------------------------------------------

/** Stored in the 'memories' table – no attachment blobs here. */
type MemoryRecord = Omit<Memory, 'attachments'>;

/** Stored in the 'attachments' table – blob + FK to parent memory. */
interface AttachmentRecord extends Omit<MemoryAttachment, 'data'> {
  memoryId: string;
  data: Blob; // Always normalised to Blob when stored
}

// ---------------------------------------------------------------------------
// Dexie database class
// ---------------------------------------------------------------------------

class MemoryBoardDB extends Dexie {
  memories!: Table<MemoryRecord, string>;
  attachments!: Table<AttachmentRecord, string>;

  constructor() {
    super('MemoryBoardDB');

    // ── v1 – original schema ──────────────────────────────────────────────
    // Only indexed fields are listed; Dexie stores the full object.
    this.version(1).stores({
      memories: 'id, createdAt, updatedAt, isPinned, orderIndex',
      attachments: 'id, memoryId',
    });

    // ── v2 – same schema, clears stale dev records ────────────────────────
    // Memories saved with editor v1 may have contentText / contentHtml that
    // includes "Copy" button text serialised by the old editor.getHTML() /
    // editor.getText() code paths.  Wiping the store forces a clean slate;
    // the user re-creates memories with the fixed serialisation path.
    this.version(2).stores({
      memories: 'id, createdAt, updatedAt, isPinned, orderIndex',
      attachments: 'id, memoryId',
    }).upgrade(async (tx) => {
      await tx.table('memories').clear();
      await tx.table('attachments').clear();
    });
  }
}

/** Singleton database instance. */
export const db = new MemoryBoardDB();

// ---------------------------------------------------------------------------
// Repository helpers
// ---------------------------------------------------------------------------

/**
 * Returns all memories with their attachments hydrated.
 * Attachments are fetched in a single bulk query and merged by memoryId.
 */
export const getAllMemories = async (): Promise<Memory[]> => {
  const [records, allAttachments] = await Promise.all([
    db.memories.toArray(),
    db.attachments.toArray(),
  ]);

  // Group attachments by their parent memory ID
  const byMemoryId = new Map<string, MemoryAttachment[]>();
  for (const att of allAttachments) {
    const { memoryId, ...attachment } = att;
    if (!byMemoryId.has(memoryId)) byMemoryId.set(memoryId, []);
    byMemoryId.get(memoryId)!.push(attachment);
  }

  return records.map((record) => ({
    ...record,
    attachments: byMemoryId.get(record.id) ?? [],
  }));
};

/**
 * Creates or updates a memory and its attachments atomically.
 * Existing attachments for this memory are replaced entirely.
 */
export const saveMemory = async (memory: Memory): Promise<void> => {
  const { attachments, ...record } = memory;

  await db.transaction('rw', db.memories, db.attachments, async () => {
    // Upsert the memory record (no blob data here)
    await db.memories.put(record as MemoryRecord);

    // Replace all attachments for this memory
    await db.attachments.where('memoryId').equals(memory.id).delete();
    for (const att of attachments) {
      const blob =
        att.data instanceof Blob
          ? att.data
          : new Blob([att.data], { type: att.mimeType });

      const record: AttachmentRecord = {
        id: att.id,
        memoryId: memory.id,
        name: att.name,
        size: att.size,
        mimeType: att.mimeType,
        data: blob,
      };
      await db.attachments.put(record);
    }
  });
};

/**
 * Deletes a memory and all its attachments by ID.
 */
export const deleteMemory = async (id: string): Promise<void> => {
  await db.transaction('rw', db.memories, db.attachments, async () => {
    await db.memories.delete(id);
    await db.attachments.where('memoryId').equals(id).delete();
  });
};

/**
 * Bulk-updates the `orderIndex` field for a list of memories.
 * Used after a drag-and-drop reorder so the new sequence is persisted.
 */
export const updateMemoryOrder = async (
  updates: Array<{ id: string; orderIndex: number }>,
): Promise<void> => {
  await db.transaction('rw', db.memories, async () => {
    for (const { id, orderIndex } of updates) {
      await db.memories.update(id, { orderIndex });
    }
  });
};

/**
 * Clears all data from both tables (used during backup import).
 */
export const clearAllData = async (): Promise<void> => {
  await db.transaction('rw', db.memories, db.attachments, async () => {
    await db.memories.clear();
    await db.attachments.clear();
  });
};

/** Utility – reconstructs a full Memory object given a MemoryRecord + attachments. */
export const hydrateMemory = (
  record: MemoryRecord,
  attachments: MemoryAttachment[] = [],
): Memory => ({
  ...record,
  attachments,
});

/** Default colour theme for new memories. */
export const DEFAULT_COLOR_THEME: ColorTheme = 'pastel-yellow';
