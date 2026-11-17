// =============================================================================
// Memory Board – Server API client
//
// Authenticated PHP endpoints live under /api/*.php.  IndexedDB is a
// per-tenant read-through cache (`memory_board_tenant_<userId>`).  Switching
// accounts opens a different database handle and never wipes the other user.
// =============================================================================

import type { Memory, MemoryAttachment } from '../types/memory';
import { database } from './database';
import { loginModal } from '../components/LoginModal';

/** Hard 1 MB attachment cap – enforced client-side before the request is sent. */
export const MAX_ATTACHMENT_BYTES = 1_048_576;

const jsonHeaders = { 'Content-Type': 'application/json' };
const SESSION_USER_ID_KEY = 'memoryboard.userId';
const SESSION_USERNAME_KEY = 'memoryboard.username';

export interface AuthResponse {
  success?: boolean;
  authenticated?: boolean;
  username: string;
  userId?: number;
}

export class AuthApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
  }
}

/** Strip Blob/ArrayBuffer fields and tenant keys so JSON.stringify stays valid. */
const toApiPayload = (memory: Memory): unknown => {
  const { userId: _userId, ...rest } = memory as Memory & { userId?: unknown };
  return {
    ...rest,
    attachments: rest.attachments.map(({ data: _data, ...meta }) => meta),
  };
};

class ApiService {
  private username: string | null = null;
  private userId: number | null = null;
  private listeners = new Set<() => void>();

  public get currentUsername(): string | null {
    return this.username;
  }

  public get currentUserId(): number | null {
    return this.userId;
  }

  /** Subscribe to session changes (login / logout). Returns an unsubscribe. */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  private setSession(username: string | null, userId: number | null): void {
    this.username = username;
    this.userId = userId;
    try {
      if (username && userId !== null) {
        localStorage.setItem(SESSION_USERNAME_KEY, username);
        localStorage.setItem(SESSION_USER_ID_KEY, String(userId));
        sessionStorage.removeItem(SESSION_USERNAME_KEY);
        sessionStorage.removeItem(SESSION_USER_ID_KEY);
      } else {
        localStorage.removeItem(SESSION_USERNAME_KEY);
        localStorage.removeItem(SESSION_USER_ID_KEY);
        sessionStorage.removeItem(SESSION_USERNAME_KEY);
        sessionStorage.removeItem(SESSION_USER_ID_KEY);
      }
    } catch {
      // Storage may be unavailable (private mode / tests).
    }
    this.notify();
  }

  private async attachTenant(data: AuthResponse): Promise<void> {
    const userId = data.userId ?? null;
    await database.switchTenant(userId);
    this.setSession(data.username, userId);
  }

  private async postAuth(body: Record<string, unknown>): Promise<Response> {
    return fetch('/api/auth.php', {
      method: 'POST',
      credentials: 'include',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    });
  }

  public async login(credentials: {
    username: string;
    password: string;
  }): Promise<AuthResponse> {
    const res = await this.postAuth({
      action: 'login',
      username: credentials.username,
      password: credentials.password,
    });
    const data = (await res.json().catch(() => ({}))) as AuthResponse & { error?: string };
    if (!res.ok) {
      throw new AuthApiError(res.status, data.error || 'Invalid username or password');
    }
    const auth: AuthResponse = {
      success: true,
      username: data.username || credentials.username,
      userId: data.userId,
    };
    await this.attachTenant(auth);
    return auth;
  }

  public async register(payload: {
    username: string;
    password: string;
    website?: string;
  }): Promise<AuthResponse> {
    const res = await this.postAuth({
      action: 'register',
      username: payload.username,
      password: payload.password,
      website: payload.website ?? '',
    });
    const data = (await res.json().catch(() => ({}))) as AuthResponse & { error?: string };
    if (!res.ok) {
      throw new AuthApiError(
        res.status,
        data.error || (res.status === 409 ? 'Username already taken' : 'Registration failed'),
      );
    }
    const auth: AuthResponse = {
      success: true,
      username: data.username || payload.username,
      userId: data.userId,
    };
    await this.attachTenant(auth);
    return auth;
  }

  /**
   * Ends the PHP session, detaches the tenant IndexedDB handle (data is kept
   * on disk for the next login), clears in-memory identity, and re-opens login.
   */
  public async logout(): Promise<void> {
    try {
      await this.postAuth({ action: 'logout' });
    } catch {
      // Still isolate local state even if the network call fails.
    }

    await database.switchTenant(null);
    this.setSession(null, null);
    await loginModal.prompt();
  }

  /**
   * Session-aware fetch.  On 401, prompt for login/register and retry
   * the original request once if authentication succeeds.
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

  private restoreCachedIdentity(): { username: string; userId: number } | null {
    try {
      const rawId =
        localStorage.getItem(SESSION_USER_ID_KEY) ??
        sessionStorage.getItem(SESSION_USER_ID_KEY);
      const username =
        localStorage.getItem(SESSION_USERNAME_KEY) ??
        sessionStorage.getItem(SESSION_USERNAME_KEY);
      if (!rawId || !username) return null;
      const userId = Number(rawId);
      if (!Number.isFinite(userId)) return null;
      return { username, userId };
    } catch {
      return null;
    }
  }

  /** GET /api/auth.php – true when the PHP session is already authenticated. */
  public async checkAuth(): Promise<boolean> {
    try {
      const res = await fetch('/api/auth.php', { credentials: 'include' });
      const data = (await res.json().catch(() => ({}))) as AuthResponse & {
        authenticated?: boolean;
      };
      if (res.ok && data.authenticated) {
        await this.attachTenant({
          username: data.username,
          userId: data.userId,
          authenticated: true,
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Called at app bootstrap.  A valid session switches the tenant partition
   * before React mounts (and therefore before getMemories()).  Offline, the
   * last known userId is used so the partitioned cache can still render.
   */
  public async ensureAuthenticated(): Promise<void> {
    try {
      const res = await fetch('/api/auth.php', { credentials: 'include' });
      const data = (await res.json().catch(() => ({}))) as AuthResponse & {
        authenticated?: boolean;
      };
      if (res.ok && data.authenticated) {
        await this.attachTenant({
          username: data.username,
          userId: data.userId,
          authenticated: true,
        });
        return;
      }
      await loginModal.prompt();
    } catch {
      const cached = this.restoreCachedIdentity();
      if (cached) {
        await database.switchTenant(cached.userId);
        this.setSession(cached.username, cached.userId);
      }
    }
  }

  public async getMemories(): Promise<Memory[]> {
    let remoteMemories: Memory[] | null = null;
    try {
      const res = await this.fetchWithAuth('/api/memories.php');
      if (!res.ok) {
        throw new Error(`Server returned status: ${res.status}`);
      }
      remoteMemories = (await res.json()) as Memory[];
    } catch (err) {
      console.warn('Backend unreachable; falling back to IndexedDB cache', err);
      try {
        return await database.getAllMemories();
      } catch (cacheError) {
        if (isCorruptCacheError(cacheError)) {
          await database.resetBrokenCache();
          throw new Error('The local copy was reset and the server could not be reached.');
        }
        throw cacheError;
      }
    }

    const loaded = remoteMemories ?? [];
    await this.writeActiveCache(loaded);
    return loaded.filter((memory) => memory.deletedAt == null);
  }

  public async getTrash(): Promise<Memory[]> {
    try {
      const res = await this.fetchWithAuth('/api/memories.php?view=trash');
      if (!res.ok) {
        throw new Error(`Server returned status: ${res.status}`);
      }
      const trashed: Memory[] = await res.json();
      try {
        await database.replaceTrashedMemories(trashed);
      } catch (err) {
        if (isCorruptCacheError(err)) {
          await database.resetBrokenCache();
          try {
            await database.replaceTrashedMemories(trashed);
          } catch {
            // The server list is still shown.
          }
        }
      }
      return trashed;
    } catch (err) {
      console.warn('Backend unreachable; falling back to local Trash', err);
      return database.getTrashedMemories();
    }
  }

  private async writeActiveCache(memories: Memory[]): Promise<void> {
    try {
      await database.replaceAllMemories(memories);
    } catch (err) {
      if (!isCorruptCacheError(err)) return;
      await database.resetBrokenCache();
      try {
        await database.replaceAllMemories(memories);
      } catch {
        // The server response is still returned to the board.
      }
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

  /**
   * Atomic restore: one POST of the full sanitised payload.
   * Local cache is updated separately via database.putMemoriesBulk().
   */
  public async importBatch(memories: Memory[]): Promise<void> {
    if (memories.length === 0) return;

    const sanitised = memories.map((memory) => toApiPayload(memory));
    const res = await this.fetchWithAuth('/api/memories.php?action=batch', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ memories: sanitised }),
    });

    if (!res.ok) {
      throw new Error(`Failed to import memories: ${res.status}`);
    }
  }

  public async deleteMemory(id: string): Promise<void> {
    const deletedAt = Date.now();
    try {
      const res = await this.fetchWithAuth(
        `/api/memories.php?id=${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      );

      if (!res.ok) {
        throw new Error(`Failed to delete memory on server: ${res.status}`);
      }
    } catch (err) {
      console.warn('Unable to sync deletion to server; moving to local Trash', err);
    } finally {
      await database.markMemoryDeleted(id, deletedAt);
    }
  }

  public async restoreMemory(id: string): Promise<void> {
    const res = await this.fetchWithAuth('/api/memories.php?action=restore', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      throw new Error(`Failed to restore memory: ${res.status}`);
    }
    await database.restoreMemory(id);
  }

  public async permanentlyDeleteMemory(id: string): Promise<void> {
    const res = await this.fetchWithAuth(
      `/api/memories.php?id=${encodeURIComponent(id)}&permanent=1`,
      { method: 'DELETE' },
    );
    if (!res.ok) {
      throw new Error(`Failed to permanently delete memory: ${res.status}`);
    }
    await database.deleteMemory(id);
  }

  public async renameTag(from: string, to: string): Promise<void> {
    const res = await this.fetchWithAuth('/api/memories.php?action=rename-tag', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ from, to }),
    });
    if (!res.ok) {
      throw new Error(`Failed to rename tag: ${res.status}`);
    }
  }

  public async emptyTrash(): Promise<void> {
    const res = await this.fetchWithAuth('/api/memories.php?action=empty-trash', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      throw new Error(`Failed to empty Trash: ${res.status}`);
    }
    await database.deleteTrashedMemories();
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

export const isCorruptCacheError = (err: unknown): boolean => {
  const text = collectErrorText(err);
  return /DatabaseClosedError|NotReadableError|Data lost due to missing file/i.test(text);
};

const collectErrorText = (err: unknown): string => {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) {
    const inner = (err as Error & { inner?: unknown }).inner;
    return `${err.name} ${err.message} ${collectErrorText(inner)}`;
  }
  return String(err);
};

export const apiService = new ApiService();
