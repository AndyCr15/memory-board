import { describe, expect, it } from 'vitest';
import type { Memory } from '../src/types/memory';
import {
  findExactDuplicate,
  isExactMemoryMatch,
} from '../src/utils/memoryComparison';

const base = (overrides: Partial<Memory> = {}): Memory => ({
  id: 'existing-id',
  title: ' Same title ',
  contentHtml: ' <p>Body</p> ',
  contentText: ' Body ',
  tags: ['beta', 'alpha'],
  colorTheme: 'note-paper',
  isPinned: true,
  orderIndex: 3,
  attachments: [
    { id: 'att-b', name: 'b.txt', size: 2, mimeType: 'text/plain', storedFilename: 'b.txt' },
    { id: 'att-a', name: 'a.txt', size: 1, mimeType: 'text/plain' },
  ],
  createdAt: 1_700_000_000_000,
  updatedAt: 1,
  ...overrides,
});

describe('isExactMemoryMatch', () => {
  it('returns true when content matches despite different id, updatedAt, tag order, and attachment order', () => {
    const existing = base();
    const candidate: Partial<Memory> = {
      id: 'incoming-id',
      title: 'Same title',
      contentHtml: '<p>Body</p>',
      contentText: 'Body',
      tags: ['alpha', 'beta'],
      colorTheme: 'note-paper',
      isPinned: true,
      attachments: [
        { id: 'other-a', name: 'a.txt', size: 1, mimeType: 'text/plain' },
        { id: 'other-b', name: 'b.txt', size: 2, mimeType: 'text/plain', storedFilename: 'b.txt' },
      ],
      createdAt: 1_700_000_000_000,
      updatedAt: 99_999,
      orderIndex: 99,
    };

    expect(isExactMemoryMatch(existing, candidate)).toBe(true);
  });

  it('returns false when title differs', () => {
    expect(isExactMemoryMatch(base(), { ...base(), title: 'Other' })).toBe(false);
  });

  it('returns false when contentHtml differs', () => {
    expect(isExactMemoryMatch(base(), { ...base(), contentHtml: '<p>Nope</p>' })).toBe(false);
  });

  it('returns false when tags differ', () => {
    expect(isExactMemoryMatch(base(), { ...base(), tags: ['alpha'] })).toBe(false);
  });

  it('returns false when createdAt differs', () => {
    expect(isExactMemoryMatch(base(), { ...base(), createdAt: 1 })).toBe(false);
  });
});

describe('findExactDuplicate', () => {
  it('returns the matching tenant memory when one exists', () => {
    const existing = base({ id: 'keep-me' });
    const found = findExactDuplicate(
      { ...existing, id: 'new', updatedAt: 8 },
      [base({ id: 'other', title: 'Unrelated' }), existing],
    );
    expect(found?.id).toBe('keep-me');
  });

  it('returns undefined when nothing matches', () => {
    expect(findExactDuplicate(base({ title: 'Fresh' }), [base()])).toBeUndefined();
  });
});
