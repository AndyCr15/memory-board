// =============================================================================
// Memory Board – Tenant-partitioned IndexedDB facade
//
// Each authenticated user gets an isolated Dexie database named
// `memory_board_tenant_<userId>`.  switchTenant() closes the current handle
// (without deleting data) and opens the target partition.  A null tenant
// uses an in-memory guest stub that always returns empty datasets.
// =============================================================================

import type { Memory } from '../types/memory';
import {
  MemoryBoardDB,
  readAllMemories,
  writeMemory,
  removeMemory,
  writeMemoryOrder,
  wipeDatabase,
  replaceAllInDatabase,
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
    return readAllMemories(this.active);
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
