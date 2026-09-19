// =============================================================================
// Memory Board – Tenant-safe JSON export / import (schema version 2)
//
// Export reads the active IndexedDB partition, strips tenant metadata
// (`userId`), and downloads a JSON document.
//
// Import merges into the current account: each record gets a new UUID,
// foreign userId is discarded, then importBatch + putMemoriesBulk persist
// the merge in one server transaction and one IndexedDB transaction.
// =============================================================================

import { saveAs } from 'file-saver';
import { database } from './database';
import { apiService } from './apiService';
import { findExactDuplicate } from '../utils/memoryComparison';
import type { ColorTheme, Memory, MemoryAttachment } from '../types/memory';
import { resolveMemoryTheme } from '../types/memory';

export const EXPORT_VERSION = 2 as const;

export interface ExportedAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  storedFilename?: string;
}

export interface ExportedMemory {
  id: string;
  title: string;
  contentHtml: string;
  contentText: string;
  tags: string[];
  attachments: ExportedAttachment[];
  colorTheme: ColorTheme;
  isPinned: boolean;
  orderIndex: number;
  createdAt: number;
  updatedAt: number;
}

export interface ExportDocument {
  version: typeof EXPORT_VERSION;
  exportedAt: number;
  memories: ExportedMemory[];
}

const sanitiseAttachment = (raw: unknown): ExportedAttachment | null => {
  if (!raw || typeof raw !== 'object') return null;
  const att = raw as Record<string, unknown>;
  if (typeof att.name !== 'string') return null;
  return {
    id: typeof att.id === 'string' ? att.id : crypto.randomUUID(),
    name: att.name,
    size: typeof att.size === 'number' ? att.size : 0,
    mimeType: typeof att.mimeType === 'string' ? att.mimeType : 'application/octet-stream',
    ...(typeof att.storedFilename === 'string' ? { storedFilename: att.storedFilename } : {}),
  };
};

/**
 * Projects a live Memory (or untrusted import row) onto the public export
 * shape.  `userId` and attachment blobs are never copied.
 */
export const sanitiseMemoryForExport = (raw: Memory | Record<string, unknown>): ExportedMemory => {
  const record = raw as Record<string, unknown>;
  const attachments = Array.isArray(record.attachments)
    ? record.attachments.map(sanitiseAttachment).filter((a): a is ExportedAttachment => a !== null)
    : [];

  return {
    id: typeof record.id === 'string' ? record.id : crypto.randomUUID(),
    title: typeof record.title === 'string' ? record.title : 'Untitled',
    contentHtml: typeof record.contentHtml === 'string' ? record.contentHtml : '',
    contentText: typeof record.contentText === 'string' ? record.contentText : '',
    tags: Array.isArray(record.tags)
      ? record.tags.filter((t): t is string => typeof t === 'string')
      : [],
    attachments,
    colorTheme: resolveMemoryTheme(record.colorTheme),
    isPinned: Boolean(record.isPinned),
    orderIndex: typeof record.orderIndex === 'number' ? record.orderIndex : 0,
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
    updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : Date.now(),
  };
};

export const buildExportDocument = (
  memories: Array<Memory | Record<string, unknown>>,
  exportedAt = Date.now(),
): ExportDocument => ({
  version: EXPORT_VERSION,
  exportedAt,
  memories: memories.map(sanitiseMemoryForExport),
});

/**
 * Re-keys an imported row for merge into the current tenant.
 * Always allocates a new id and drops any foreign userId.
 */
export const prepareImportedMemory = (
  raw: unknown,
  now = Date.now(),
): Memory => {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid memory record in backup.');
  }

  const exported = sanitiseMemoryForExport(raw as Record<string, unknown>);
  const attachments: MemoryAttachment[] = exported.attachments.map((att) => ({
    id: crypto.randomUUID(),
    name: att.name,
    size: att.size,
    mimeType: att.mimeType,
    storedFilename: att.storedFilename,
  }));

  return {
    id: crypto.randomUUID(),
    title: exported.title,
    contentHtml: exported.contentHtml,
    contentText: exported.contentText,
    tags: exported.tags,
    attachments,
    colorTheme: exported.colorTheme,
    isPinned: exported.isPinned,
    orderIndex: exported.orderIndex,
    createdAt: exported.createdAt,
    updatedAt: now,
  };
};

export const parseImportDocument = (text: string): ExportDocument => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid backup: expected a JSON object.');
  }

  const doc = parsed as Record<string, unknown>;
  if (!Array.isArray(doc.memories)) {
    throw new Error('Invalid backup: missing "memories" array.');
  }

  return {
    version: EXPORT_VERSION,
    exportedAt: typeof doc.exportedAt === 'number' ? doc.exportedAt : Date.now(),
    memories: doc.memories.map((row) => sanitiseMemoryForExport(row as Record<string, unknown>)),
  };
};

export const exportBackup = async (): Promise<void> => {
  const memories = await database.getMemories();
  const document = buildExportDocument(memories);
  const json = JSON.stringify(document, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const filename = `memory-board-${new Date().toISOString().slice(0, 10)}.json`;
  saveAs(blob, filename);
};

/**
 * Merges memories from a JSON backup into the signed-in tenant.
 * Exact duplicates already in IndexedDB are skipped before new UUIDs
 * are assigned and before any batch network call.
 */
export const importBackup = async (
  file: File,
): Promise<{ count: number; skippedCount: number }> => {
  const text = await file.text();
  const document = parseImportDocument(text);
  const existingMemories = await database.getMemories();
  const now = Date.now();

  let skippedCount = 0;
  const sanitisedMemories: Memory[] = [];

  for (const candidate of document.memories) {
    if (findExactDuplicate(candidate, existingMemories)) {
      skippedCount += 1;
      continue;
    }
    sanitisedMemories.push(prepareImportedMemory(candidate, now));
  }

  if (sanitisedMemories.length === 0) {
    return { count: 0, skippedCount };
  }

  await apiService.importBatch(sanitisedMemories);
  await database.putMemoriesBulk(sanitisedMemories);

  return { count: sanitisedMemories.length, skippedCount };
};
