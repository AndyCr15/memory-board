import { describe, expect, it } from 'vitest';
import { filterMemories } from './Board';
import type { Memory } from '../types/memory';

const memory = (overrides: Partial<Memory> = {}): Memory => ({
  id: 'mem-1',
  title: 'Descaling',
  contentHtml: '<p>Steps</p>',
  contentText: 'Steps',
  tags: ['coffee'],
  colorTheme: 'note-paper',
  isPinned: false,
  orderIndex: 0,
  attachments: [],
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

describe('filterMemories search', () => {
  it('finds a card by tag when the word is not in the title or body', () => {
    const cards = [memory()];
    expect(filterMemories(cards, 'coffee', [])).toEqual(cards);
    expect(filterMemories(cards, 'COFFEE', [])).toHaveLength(1);
    expect(filterMemories(cards, 'tea', [])).toHaveLength(0);
  });

  it('still requires every selected tag chip after the search matches', () => {
    const cards = [memory({ tags: ['coffee'] })];
    expect(filterMemories(cards, 'coffee', ['clean'])).toHaveLength(0);
    expect(filterMemories(cards, 'coffee', ['coffee'])).toHaveLength(1);
  });

  it('hides trashed memories from search', () => {
    const cards = [memory({ deletedAt: 50 })];
    expect(filterMemories(cards, 'coffee', [])).toHaveLength(0);
  });
});
