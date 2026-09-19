// =============================================================================
// apiService – upload size guard, IndexedDB fallback, auth + tenant attach
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiService, MAX_ATTACHMENT_BYTES } from './apiService';
import { database } from './database';
import { loginModal } from '../components/LoginModal';
import type { Memory } from '../types/memory';

vi.mock('./database', () => ({
  database: {
    getAllMemories: vi.fn(),
    replaceAllMemories: vi.fn(),
    putMemory: vi.fn(),
    putMemoriesBulk: vi.fn(),
    deleteMemory: vi.fn(),
    clearLocalData: vi.fn(),
    switchTenant: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../components/LoginModal', () => ({
  loginModal: {
    prompt: vi.fn().mockResolvedValue(true),
  },
}));

const cachedMemory: Memory = {
  id: 'cached-1',
  title: 'Cached note',
  contentHtml: '<p>offline</p>',
  contentText: 'offline',
  tags: [],
  colorTheme: 'pastel-yellow',
  isPinned: false,
  orderIndex: 0,
  attachments: [],
  createdAt: 1,
  updatedAt: 1,
};

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('apiService.uploadAttachment', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('rejects files larger than 1,048,576 bytes before dispatching the request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const oversized = new File(['x'], 'huge.bin', { type: 'application/octet-stream' });
    Object.defineProperty(oversized, 'size', { value: MAX_ATTACHMENT_BYTES + 1 });

    await expect(apiService.uploadAttachment(oversized)).rejects.toThrow(
      /1 MB file size limit/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('dispatches the upload when the file is within the 1 MB cap', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      id: 'att-1',
      name: 'notes.txt',
      size: 12,
      mimeType: 'text/plain',
      storedFilename: 'abc.txt',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['hello world'], 'notes.txt', { type: 'text/plain' });
    const result = await apiService.uploadAttachment(file);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/upload.php');
    expect(result.storedFilename).toBe('abc.txt');
  });
});

describe('apiService.getMemories', () => {
  beforeEach(() => {
    vi.mocked(database.getAllMemories).mockReset();
    vi.mocked(database.replaceAllMemories).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('reads from the IndexedDB cache when the network request throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    vi.mocked(database.getAllMemories).mockResolvedValue([cachedMemory]);

    const result = await apiService.getMemories();

    expect(database.getAllMemories).toHaveBeenCalledTimes(1);
    expect(database.replaceAllMemories).not.toHaveBeenCalled();
    expect(result).toEqual([cachedMemory]);
  });

  it('hydrates the IndexedDB cache when the server responds successfully', async () => {
    const remote = [{ ...cachedMemory, id: 'remote-1', title: 'Remote' }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(remote)));
    vi.mocked(database.replaceAllMemories).mockResolvedValue(undefined);

    const result = await apiService.getMemories();

    expect(database.replaceAllMemories).toHaveBeenCalledWith(remote);
    expect(database.getAllMemories).not.toHaveBeenCalled();
    expect(result[0].title).toBe('Remote');
  });
});

describe('apiService.register / login / logout / bootstrap', () => {
  beforeEach(() => {
    vi.mocked(database.switchTenant).mockResolvedValue(undefined);
    vi.mocked(database.clearLocalData).mockResolvedValue(undefined);
    vi.mocked(loginModal.prompt).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('register() submits the honeypot field on the auth payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      username: 'alice',
      userId: 7,
    }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await apiService.register({
      username: 'alice',
      password: 'secret123',
      website: 'https://spam.example',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth.php');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      action: 'register',
      username: 'alice',
      password: 'secret123',
      website: 'https://spam.example',
    });
    expect(database.switchTenant).toHaveBeenCalledWith(7);
    expect(database.clearLocalData).not.toHaveBeenCalled();
    expect(apiService.currentUsername).toBe('alice');
    expect(apiService.currentUserId).toBe(7);
  });

  it('login() attaches the tenant partition without wiping it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      username: 'bob',
      userId: 3,
    }));
    vi.stubGlobal('fetch', fetchMock);

    await apiService.login({ username: 'bob', password: 'hunter2xx' });

    expect(database.switchTenant).toHaveBeenCalledWith(3);
    expect(database.clearLocalData).not.toHaveBeenCalled();
    expect(apiService.currentUsername).toBe('bob');
  });

  it('ensureAuthenticated() switches tenant from a restored session before getMemories', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      authenticated: true,
      username: 'alice',
      userId: 11,
    }));
    vi.stubGlobal('fetch', fetchMock);

    await apiService.ensureAuthenticated();

    expect(database.switchTenant).toHaveBeenCalledWith(11);
    expect(database.switchTenant).toHaveBeenCalledTimes(1);
    expect(database.clearLocalData).not.toHaveBeenCalled();
    expect(apiService.currentUserId).toBe(11);
  });

  it('logout() posts { action: "logout" }, detaches storage, and blocks unauthenticated reads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await apiService.logout();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth.php');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ action: 'logout' });
    expect(database.switchTenant).toHaveBeenCalledWith(null);
    expect(database.clearLocalData).not.toHaveBeenCalled();
    expect(loginModal.prompt).toHaveBeenCalledTimes(1);
    expect(apiService.currentUsername).toBeNull();
    expect(apiService.currentUserId).toBeNull();
  });
});

describe('apiService.importBatch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('posts the unified memories payload to the batch endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, count: 2 }));
    vi.stubGlobal('fetch', fetchMock);

    const batch: Memory[] = [
      { ...cachedMemory, id: 'm-2', title: 'Second' },
      { ...cachedMemory, id: 'm-1', title: 'First', attachments: [{
        id: 'a1',
        name: 'note.txt',
        size: 4,
        mimeType: 'text/plain',
        data: new Blob(['hi']),
      }] },
    ];

    await apiService.importBatch(batch);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/memories.php?action=batch');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body)) as { memories: Array<Record<string, unknown>> };
    expect(body.memories).toHaveLength(2);
    expect(body.memories.map((m) => m.id)).toEqual(['m-2', 'm-1']);
    expect(body.memories[1]).not.toHaveProperty('userId');
    expect((body.memories[1].attachments as Array<Record<string, unknown>>)[0]).not.toHaveProperty('data');
    expect(database.putMemoriesBulk).not.toHaveBeenCalled();
  });
});
