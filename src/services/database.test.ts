// =============================================================================
// Tenant-partitioned IndexedDB – isolation & guest stub
// =============================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { database } from './database';
import { tenantDatabaseName } from '../db/database';
import type { Memory } from '../types/memory';

const memory = (id: string, title: string): Memory => ({
  id,
  title,
  contentHtml: `<p>${title}</p>`,
  contentText: title,
  tags: [],
  colorTheme: 'pastel-yellow',
  isPinned: false,
  orderIndex: 0,
  attachments: [],
  createdAt: 1,
  updatedAt: 1,
});

describe('database.switchTenant', () => {
  afterEach(async () => {
    await database.switchTenant(null);
    await Dexie.delete(tenantDatabaseName(1));
    await Dexie.delete(tenantDatabaseName(2));
  });

  it('writes to distinct database instances for tenant 1 and tenant 2', async () => {
    await database.switchTenant(1);
    await database.putMemory(memory('a', 'Alice note'));

    await database.switchTenant(2);
    await database.putMemory(memory('b', 'Bob note'));

    await database.switchTenant(1);
    const alice = await database.getAllMemories();
    expect(alice.map((m) => m.title)).toEqual(['Alice note']);
    expect(alice.some((m) => m.id === 'b')).toBe(false);

    await database.switchTenant(2);
    const bob = await database.getAllMemories();
    expect(bob.map((m) => m.title)).toEqual(['Bob note']);
    expect(bob.some((m) => m.id === 'a')).toBe(false);
  });

  it('does not wipe tenant 1 when switching away and back', async () => {
    await database.switchTenant(1);
    await database.putMemory(memory('keep', 'Persisted'));

    await database.switchTenant(2);
    await database.clearLocalData();

    await database.switchTenant(1);
    const restored = await database.getAllMemories();
    expect(restored).toHaveLength(1);
    expect(restored[0].title).toBe('Persisted');
  });

  it('guest mode (null tenant) returns empty data and ignores writes', async () => {
    await database.switchTenant(1);
    await database.putMemory(memory('hidden', 'Should not leak'));

    await database.switchTenant(null);
    expect(database.activeTenantId).toBeNull();
    expect(await database.getAllMemories()).toEqual([]);

    await database.putMemory(memory('guest', 'Dropped'));
    expect(await database.getAllMemories()).toEqual([]);

    await database.switchTenant(1);
    const stillThere = await database.getAllMemories();
    expect(stillThere.map((m) => m.id)).toEqual(['hidden']);
  });
});

describe('database.putMemoriesBulk', () => {
  afterEach(async () => {
    await database.switchTenant(null);
    await Dexie.delete(tenantDatabaseName(1));
  });

  it('writes multiple entries in a single IndexedDB transaction', async () => {
    await database.switchTenant(1);

    const spy = vi.spyOn(IDBDatabase.prototype, 'transaction');
    await expect(
      database.putMemoriesBulk([memory('bulk-b', 'Beta'), memory('bulk-a', 'Alpha')]),
    ).resolves.toBeUndefined();

    const readwriteCalls = spy.mock.calls.filter(([, mode]) => mode === 'readwrite');
    expect(readwriteCalls.length).toBe(1);

    const stored = await database.getAllMemories();
    expect(stored.map((m) => m.id).sort()).toEqual(['bulk-a', 'bulk-b']);
    spy.mockRestore();
  });
});
