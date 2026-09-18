import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagInput, normalizeTag } from './TagInput';

describe('normalizeTag', () => {
  it('trims, lowercases, and hyphenates whitespace', () => {
    expect(normalizeTag('  Hello World  ')).toBe('hello-world');
  });
});

describe('TagInput suggestion selection', () => {
  it('appends a suggested tag on mousedown without requiring a click', () => {
    const onAddTag = vi.fn();
    const onInputChange = vi.fn();

    render(
      <TagInput
        tags={[]}
        inputValue=""
        onInputChange={onInputChange}
        existingTags={['typescript', 'git']}
        onAddTag={onAddTag}
        onRemoveTag={vi.fn()}
      />,
    );

    fireEvent.focus(screen.getByPlaceholderText(/Add a tag/));
    const suggestion = screen.getByRole('button', { name: '#typescript' });

    const event = fireEvent.mouseDown(suggestion);
    expect(event).toBe(false); // preventDefault() was called
    expect(onAddTag).toHaveBeenCalledWith('typescript');
  });

  it('does not list tags that are already selected', () => {
    render(
      <TagInput
        tags={['typescript']}
        inputValue=""
        onInputChange={vi.fn()}
        existingTags={['typescript', 'git']}
        onAddTag={vi.fn()}
        onRemoveTag={vi.fn()}
      />,
    );

    fireEvent.focus(screen.getByPlaceholderText(/Add a tag/));
    expect(screen.queryByRole('button', { name: '#typescript' })).toBeNull();
    expect(screen.getByRole('button', { name: '#git' })).toBeTruthy();
  });
});
