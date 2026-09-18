// =============================================================================
// Memory Board – Server API client
//
// All board mutations go through this module.  Authenticated PHP endpoints
// live under /api/*.php; IndexedDB is a read-through / write-through cache
// used when the network is unavailable.
//
// 401 handling: fetchWithAuth() shows LoginModal.prompt() once, then retries
// the original request.  A second 401 is returned to the caller.
// =============================================================================

import type { Memory, MemoryAttachment } from '../types/memory';
import { database } from '../db/database';
import { loginModal } from '../components/LoginModal';

/** Hard 1 MB attachment cap – enforced client-side before the request is sent. */
export const MAX_ATTACHMENT_BYTES = 1_048_576;

const jsonHeaders = { 'Content-Type': 'application/json' };

/** Strip Blob/ArrayBuffer fields so JSON.stringify stays small and valid. */
const toApiPayload = (memory: Memory): unknown => ({
  ...memory,
  attachments: memory.attachments.map(({ data: _data, ...meta }) => meta),
});

class ApiService {
  /**
   * Session-aware fetch.  On 401, prompt for the master password and retry
   * the request once if login succeeds.
   */
  private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const init: RequestInit = { credentials: 'include', ...options };
    let response = await fetch(url, init);

    if (response.status === 401) {
      const authorized = await loginModal.prompt();
      if (authorized) {
        response = await fetch(url, init);
      }
    }

    return response;
  }

  /** GET /api/auth.php – true when the PHP session is already authenticated. */
  public async checkAuth(): Promise<boolean> {
    try {
      const res = await fetch('/api/auth.php', { credentials: 'include' });
      if (!res.ok) return false;
      const data = (await res.json()) as { authenticated?: boolean };
      return data.authenticated === true;
    } catch {
      return false;
    }
  }

  /**
   * Called at app bootstrap.  If the server is reachable and the session is
   * anonymous, show the login modal before the first data fetch.  Network
   * failures skip the prompt so IndexedDB can still serve an offline board.
   */
  public async ensureAuthenticated(): Promise<void> {
    try {
      const res = await fetch('/api/auth.php', { credentials: 'include' });
      if (!res.ok) {
        await loginModal.prompt();
        return;
      }
      const data = (await res.json()) as { authenticated?: boolean };
      if (!data.authenticated) {
        await loginModal.prompt();
      }
    } catch {
      // Offline – continue; getMemories() will fall back to IndexedDB.
    }
  }

  public async getMemories(): Promise<Memory[]> {
    try {
      const res = await this.fetchWithAuth('/api/memories.php');
      if (!res.ok) {
        throw new Error(`Server returned status: ${res.status}`);
      }
      const remoteMemories: Memory[] = await res.json();
      await database.replaceAllMemories(remoteMemories);
      return remoteMemories;
    } catch (err) {
      console.warn('Backend unreachable; falling back to IndexedDB cache', err);
      return database.getAllMemories();
    }
  }

  public async saveMemory(memory: Memory): Promise<void> {
    try {
      const res = await this.fetchWithAuth('/api/memories.php', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(toApiPayload(memory)),
      });

      if (!res.ok) {
        throw new Error(`Failed to save memory to server: ${res.status}`);
      }
    } catch (err) {
      console.warn('Unable to sync save to server; persisting locally only', err);
    } finally {
      await database.putMemory(memory);
    }
  }

  public async deleteMemory(id: string): Promise<void> {
    try {
      const res = await this.fetchWithAuth(
        `/api/memories.php?id=${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      );

      if (!res.ok) {
        throw new Error(`Failed to delete memory on server: ${res.status}`);
      }
    } catch (err) {
      console.warn('Unable to sync deletion to server; deleting locally', err);
    } finally {
      await database.deleteMemory(id);
    }
  }

  /**
   * Uploads a file to /api/upload.php.
   * Rejects synchronously when `file.size` exceeds 1,048,576 bytes so the
   * request is never dispatched.
   */
  public async uploadAttachment(file: File): Promise<MemoryAttachment> {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new Error('Attachment exceeds the 1 MB file size limit.');
    }

    const formData = new FormData();
    formData.append('file', file);

    const res = await this.fetchWithAuth('/api/upload.php', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      if (res.status === 413) {
        throw new Error('Attachment exceeds the 1 MB file size limit.');
      }
      throw new Error('Upload failed.');
    }

    return (await res.json()) as MemoryAttachment;
  }
}

export const apiService = new ApiService();
