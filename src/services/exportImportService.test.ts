// =============================================================================
// Tenant-safe JSON export / import
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import {
  buildExportDocument,
  importBackup,
  parseImportDocument,
  prepareImportedMemory,
} from './exportImportService';
import { database } from './database';
import { apiService } from './apiService';
import { tenantDatabaseName } from '../db/database';
import type { Memory } from '../types/memory';

vi.mock('./apiService', () => ({
  apiService: {
    importBatch: vi.fn(),
    saveMemory: vi.fn(),
    currentUserId: 9,
  },
}));

const sample = (overrides: Partial<Memory> & { userId?: number } = {}): Memory & { userId?: number } => ({
  id: 'orig-id-1111-1111-1111-111111111111',
  title: 'Exported note',
  contentHtml: '<p>Hello</p>',
  contentText: 'Hello',
  tags: ['tenant'],
  colorTheme: 'pastel-blue',
  isPinned: false,
  orderIndex: 2,
  attachments: [],
  createdAt: 1_000,
  updatedAt: 2_000,
  ...overrides,
});

describe('export sanitisation', () => {
  it('omits userId from the exported JSON document', () => {
    const tainted = sample({ userId: 42 });
    const doc = buildExportDocument([tainted], 1_726_725_600_000);
    const json = JSON.stringify(doc);

    expect(json).not.toContain('userId');
    expect(json).not.toContain('"42"');
    expect(doc.version).toBe(2);
    expect(doc.memories).toHaveLength(1);
    expect(doc.memories[0].title).toBe('Exported note');
    expect(doc.memories[0]).not.toHaveProperty('userId');
  });
});

describe('import merge', () => {
  it('assigns a fresh UUID and drops foreign tenant metadata', () => {
    const incoming = sample({ userId: 99, id: 'foreign-id' });
    const merged = prepareImportedMemory(incoming, 9_000);

    expect(merged.id).not.toBe('foreign-id');
    expect(merged.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(merged).not.toHaveProperty('userId');
    expect(merged.updatedAt).toBe(9_000);
    expect(merged.title).toBe('Exported note');
  });

  it('rejects backups that are missing a memories array', () => {
    expect(() => parseImportDocument('{"version":2}')).toThrow(/memories/i);
    expect(() => parseImportDocument('[]')).toThrow(/JSON object/i);
  });
});

describe('import persistence through the active tenant partition', () => {
  beforeEach(() => {
    vi.mocked(apiService.importBatch).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    vi.mocked(apiService.importBatch).mockReset();
    await database.switchTenant(null);
    await Dexie.delete(tenantDatabaseName(9));
  });

  it('persists imported memories in the tenant store across a simulated refresh', async () => {
    await database.switchTenant(9);

    const payload = buildExportDocument([
      sample({ id: 'should-not-survive', userId: 1, title: 'Merged in' }),
    ]);
    const file = new File([JSON.stringify(payload)], 'backup.json', {
      type: 'application/json',
    });

    const { count } = await importBackup(file);
    expect(count).toBe(1);
    expect(apiService.importBatch).toHaveBeenCalledTimes(1);

    const saved = vi.mocked(apiService.importBatch).mock.calls[0][0][0];
    expect(saved.id).not.toBe('should-not-survive');
    expect(saved).not.toHaveProperty('userId');

    // Detach (page refresh / logout) then re-attach the same tenant.
    await database.switchTenant(null);
    expect(await database.getMemories()).toEqual([]);

    await database.switchTenant(9);
    const restored = await database.getMemories();
    expect(restored).toHaveLength(1);
    expect(restored[0].title).toBe('Merged in');
    expect(restored[0].id).toBe(saved.id);
  });
});
