// =============================================================================
// Memory Board – Dexie schema + record helpers
//
// Each tenant opens a separate IndexedDB via MemoryBoardDB(name).
// The active handle is owned by src/services/database.ts (switchTenant).
// =============================================================================

import Dexie, { type Table } from 'dexie';
import type { Memory, MemoryAttachment, ColorTheme } from '../types/memory';

export type MemoryRecord = Omit<Memory, 'attachments'>;

export interface AttachmentRecord extends Omit<MemoryAttachment, 'data'> {
  memoryId: string;
  data: Blob;
}

export const tenantDatabaseName = (userId: number): string =>
  `memory_board_tenant_${userId}`;

export class MemoryBoardDB extends Dexie {
  memories!: Table<MemoryRecord, string>;
  attachments!: Table<AttachmentRecord, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      memories: 'id, createdAt, updatedAt, isPinned, orderIndex',
      attachments: 'id, memoryId',
    });
  }
}

export const hydrateMemories = (
  records: MemoryRecord[],
  allAttachments: AttachmentRecord[],
): Memory[] => {
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

export const readAllMemories = async (db: MemoryBoardDB): Promise<Memory[]> => {
  const [records, allAttachments] = await Promise.all([
    db.memories.toArray(),
    db.attachments.toArray(),
  ]);
  return hydrateMemories(records, allAttachments);
};

export const upsertMemoryRecords = async (
  db: MemoryBoardDB,
  memory: Memory,
): Promise<void> => {
  const { attachments, ...record } = memory;
  await db.memories.put(record as MemoryRecord);
  await db.attachments.where('memoryId').equals(memory.id).delete();

  for (const att of attachments) {
    let blob: Blob;
    if (att.data instanceof Blob) {
      blob = att.data;
    } else if (att.data) {
      blob = new Blob([att.data], { type: att.mimeType });
    } else {
      blob = new Blob([], { type: att.mimeType || 'application/octet-stream' });
    }

    await db.attachments.put({
      id: att.id,
      memoryId: memory.id,
      name: att.name,
      size: att.size,
      mimeType: att.mimeType,
      storedFilename: att.storedFilename,
      data: blob,
    });
  }
};

export const writeMemory = async (db: MemoryBoardDB, memory: Memory): Promise<void> => {
  await db.transaction('rw', db.memories, db.attachments, async () => {
    await upsertMemoryRecords(db, memory);
  });
};

export const writeMemoriesBulk = async (
  db: MemoryBoardDB,
  memories: Memory[],
): Promise<void> => {
  await db.transaction('rw', db.memories, db.attachments, async () => {
    for (const memory of memories) {
      await upsertMemoryRecords(db, memory);
    }
  });
};

export const removeMemory = async (db: MemoryBoardDB, id: string): Promise<void> => {
  await db.transaction('rw', db.memories, db.attachments, async () => {
    await db.memories.delete(id);
    await db.attachments.where('memoryId').equals(id).delete();
  });
};

export const writeMemoryOrder = async (
  db: MemoryBoardDB,
  updates: Array<{ id: string; orderIndex: number }>,
): Promise<void> => {
  await db.transaction('rw', db.memories, async () => {
    for (const { id, orderIndex } of updates) {
      await db.memories.update(id, { orderIndex });
    }
  });
};

export const wipeDatabase = async (db: MemoryBoardDB): Promise<void> => {
  await db.transaction('rw', db.memories, db.attachments, async () => {
    await db.memories.clear();
    await db.attachments.clear();
  });
};

export const markMemoryDeleted = async (
  db: MemoryBoardDB,
  id: string,
  deletedAt: number,
): Promise<void> => {
  await db.memories.update(id, { deletedAt });
};

export const clearMemoryDeleted = async (
  db: MemoryBoardDB,
  id: string,
): Promise<void> => {
  await db.memories.update(id, { deletedAt: null });
};

export const removeTrashedMemories = async (db: MemoryBoardDB): Promise<void> => {
  await db.transaction('rw', db.memories, db.attachments, async () => {
    const trashed = await db.memories.filter((row) => row.deletedAt != null).toArray();
    for (const row of trashed) {
      await db.memories.delete(row.id);
      await db.attachments.where('memoryId').equals(row.id).delete();
    }
  });
};

/**
 * Replace the active (not trashed) rows. Local Trash rows stay put unless
 * the server now lists that id as active again.
 */
export const replaceAllInDatabase = async (
  db: MemoryBoardDB,
  memories: Memory[],
): Promise<void> => {
  await db.transaction('rw', db.memories, db.attachments, async () => {
    const existing = await db.memories.toArray();
    const incomingIds = new Set(memories.map((memory) => memory.id));
    for (const row of existing) {
      if (row.deletedAt != null && !incomingIds.has(row.id)) continue;
      await db.memories.delete(row.id);
      await db.attachments.where('memoryId').equals(row.id).delete();
    }
    for (const memory of memories) {
      await upsertMemoryRecords(db, { ...memory, deletedAt: null });
    }
  });
};

/** Replace only Trash rows, leaving the active board cache untouched. */
export const replaceTrashedInDatabase = async (
  db: MemoryBoardDB,
  memories: Memory[],
): Promise<void> => {
  await db.transaction('rw', db.memories, db.attachments, async () => {
    const existing = await db.memories.toArray();
    for (const row of existing) {
      if (row.deletedAt == null) continue;
      await db.memories.delete(row.id);
      await db.attachments.where('memoryId').equals(row.id).delete();
    }
    for (const memory of memories) {
      await upsertMemoryRecords(db, {
        ...memory,
        deletedAt: memory.deletedAt ?? Date.now(),
      });
    }
  });
};

export const DEFAULT_COLOR_THEME: ColorTheme = 'note-paper';
