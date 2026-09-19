import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryCard } from '../src/components/MemoryCard';
import type { Memory, MemoryTheme } from '../src/types/memory';
import { resolveMemoryTheme } from '../src/types/memory';

const noop = () => {};

const cardMemory = (theme: string): Memory => ({
  id: `mem-${theme}`,
  title: `Card ${theme}`,
  contentHtml: '<p>Preview</p>',
  contentText: 'Preview',
  tags: ['demo'],
  colorTheme: theme as Memory['colorTheme'],
  isPinned: false,
  orderIndex: 0,
  attachments: [],
  createdAt: 1,
  updatedAt: 1,
});

const renderCard = (theme: string) =>
  render(
    <MemoryCard
      memory={cardMemory(theme)}
      onView={noop}
      onEdit={noop}
      onDelete={noop}
      onPin={noop}
      onDragStart={noop}
      onDragOver={noop}
      onDrop={noop}
    />,
  );

const THEMES: MemoryTheme[] = ['note-paper', 'thought-bubble', 'blueprint', 'terminal'];

describe('MemoryCard theme rendering', () => {
  it.each(THEMES)('sets data-theme="%s" on the card root', (theme) => {
    const { container } = renderCard(theme);
    const root = container.querySelector('.memory-card');
    expect(root).toHaveAttribute('data-theme', theme);
  });

  it('maps legacy pastel theme strings to note-paper', () => {
    expect(resolveMemoryTheme('pastel-yellow')).toBe('note-paper');
    expect(resolveMemoryTheme('pastel-pink')).toBe('note-paper');

    const { container } = renderCard('pastel-yellow');
    const root = container.querySelector('.memory-card');
    expect(root).toHaveAttribute('data-theme', 'note-paper');
  });

  it('defaults unknown values to note-paper', () => {
    const { container } = renderCard('unknown-theme');
    expect(container.querySelector('.memory-card')).toHaveAttribute(
      'data-theme',
      'note-paper',
    );
  });
});
