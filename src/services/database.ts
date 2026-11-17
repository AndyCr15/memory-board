// =============================================================================
// Memory Board – Tenant-partitioned IndexedDB facade
//
// Each authenticated user gets an isolated Dexie database named
// `memory_board_tenant_<userId>`.  switchTenant() closes the current handle
// (without deleting data) and opens the target partition.  A null tenant
// uses an in-memory guest stub that always returns empty datasets.
// =============================================================================

import Dexie from 'dexie';
import type { Memory } from '../types/memory';
import {
  MemoryBoardDB,
  readAllMemories,
  writeMemory,
  removeMemory,
  writeMemoryOrder,
  wipeDatabase,
  replaceAllInDatabase,
  replaceTrashedInDatabase,
  markMemoryDeleted,
  clearMemoryDeleted,
  removeTrashedMemories,
  writeMemoriesBulk,
  tenantDatabaseName,
  DEFAULT_COLOR_THEME,
} from '../db/database';

export { DEFAULT_COLOR_THEME, tenantDatabaseName };

class TenantDatabase {
  private active: MemoryBoardDB | null = null;
  private tenantId: number | null = null;

  /** Currently attached tenant, or null for the guest stub. */
  get activeTenantId(): number | null {
    return this.tenantId;
  }

  /** IndexedDB name for the open handle, or null when guest. */
  get activeDatabaseName(): string | null {
    return this.tenantId === null ? null : tenantDatabaseName(this.tenantId);
  }

  /**
   * Swap the live Dexie handle.  Closing does not delete the previous
   * tenant's store — User A and User B keep independent caches.
   */
  async switchTenant(userId: number | null): Promise<void> {
    if (this.tenantId === userId) {
      if (userId === null || this.active) return;
    }

    if (this.active) {
      this.active.close();
      this.active = null;
    }

    this.tenantId = userId;

    if (userId !== null) {
      this.active = new MemoryBoardDB(tenantDatabaseName(userId));
    }
  }

  async getAllMemories(): Promise<Memory[]> {
    if (!this.active) return [];
    const memories = await readAllMemories(this.active);
    return memories.filter((memory) => memory.deletedAt == null);
  }

  async getTrashedMemories(): Promise<Memory[]> {
    if (!this.active) return [];
    const memories = await readAllMemories(this.active);
    return memories.filter((memory) => memory.deletedAt != null);
  }

  /** Alias used by export/import (`database.getMemories()`). */
  async getMemories(): Promise<Memory[]> {
    return this.getAllMemories();
  }

  async putMemory(memory: Memory): Promise<void> {
    if (!this.active) return;
    await writeMemory(this.active, memory);
  }

  async deleteMemory(id: string): Promise<void> {
    if (!this.active) return;
    await removeMemory(this.active, id);
  }

  async markMemoryDeleted(id: string, deletedAt: number): Promise<void> {
    if (!this.active) return;
    await markMemoryDeleted(this.active, id, deletedAt);
  }

  async restoreMemory(id: string): Promise<void> {
    if (!this.active) return;
    await clearMemoryDeleted(this.active, id);
  }

  async replaceTrashedMemories(memories: Memory[]): Promise<void> {
    if (!this.active) return;
    await replaceTrashedInDatabase(this.active, memories);
  }

  async deleteTrashedMemories(): Promise<void> {
    if (!this.active) return;
    await removeTrashedMemories(this.active);
  }

  /**
   * Drop the open tenant database after IndexedDB reports a missing file,
   * then open a fresh empty handle.
   */
  async resetBrokenCache(): Promise<void> {
    const userId = this.tenantId;
    const name = this.activeDatabaseName;
    if (this.active) {
      this.active.close();
      this.active = null;
    }
    if (name) {
      await Dexie.delete(name);
    }
    if (userId !== null) {
      this.active = new MemoryBoardDB(tenantDatabaseName(userId));
    }
  }

  async updateMemoryOrder(
    updates: Array<{ id: string; orderIndex: number }>,
  ): Promise<void> {
    if (!this.active) return;
    await writeMemoryOrder(this.active, updates);
  }

  async replaceAllMemories(memories: Memory[]): Promise<void> {
    if (!this.active) return;
    await replaceAllInDatabase(this.active, memories);
  }

  /**
   * Write many memories in one IndexedDB readwrite transaction on the
   * active tenant partition.
   */
  async putMemoriesBulk(memories: Memory[]): Promise<void> {
    if (!this.active) return;
    await writeMemoriesBulk(this.active, memories);
  }

  /**
   * Purge only the *active* tenant partition.  Not used on routine login.
   */
  async clearLocalData(): Promise<void> {
    if (!this.active) return;
    await wipeDatabase(this.active);
  }
}

export const database = new TenantDatabase();

export const switchTenant = (userId: number | null): Promise<void> =>
  database.switchTenant(userId);

export const clearLocalData = (): Promise<void> => database.clearLocalData();

export const getAllMemories = (): Promise<Memory[]> => database.getAllMemories();
export const saveMemory = (memory: Memory): Promise<void> => database.putMemory(memory);
export const putMemory = saveMemory;
export const deleteMemory = (id: string): Promise<void> => database.deleteMemory(id);
export const updateMemoryOrder = (
  updates: Array<{ id: string; orderIndex: number }>,
): Promise<void> => database.updateMemoryOrder(updates);
export const replaceAllMemories = (memories: Memory[]): Promise<void> =>
  database.replaceAllMemories(memories);
export const putMemoriesBulk = (memories: Memory[]): Promise<void> =>
  database.putMemoriesBulk(memories);
export const clearAllData = clearLocalData;
