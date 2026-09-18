// =============================================================================
// apiService – upload size guard + IndexedDB fallback
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiService, MAX_ATTACHMENT_BYTES } from './apiService';
import { database } from '../db/database';
import type { Memory } from '../types/memory';

vi.mock('../db/database', () => ({
  database: {
    getAllMemories: vi.fn(),
    replaceAllMemories: vi.fn(),
    putMemory: vi.fn(),
    deleteMemory: vi.fn(),
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
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'att-1',
        name: 'notes.txt',
        size: 12,
        mimeType: 'text/plain',
        storedFilename: 'abc.txt',
      }),
    });
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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => remote,
      }),
    );
    vi.mocked(database.replaceAllMemories).mockResolvedValue(undefined);

    const result = await apiService.getMemories();

    expect(database.replaceAllMemories).toHaveBeenCalledWith(remote);
    expect(database.getAllMemories).not.toHaveBeenCalled();
    expect(result[0].title).toBe('Remote');
  });
});
