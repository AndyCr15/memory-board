// =============================================================================
// MemoryEditorModal – backdrop autosave
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryEditorModal } from './MemoryEditorModal';
import { isViableDraft } from '../editor/editorConfig';

vi.mock('../services/apiService', () => ({
  MAX_ATTACHMENT_BYTES: 1_048_576,
  apiService: {
    saveMemory: vi.fn().mockResolvedValue(undefined),
    uploadAttachment: vi.fn(),
  },
}));

describe('isViableDraft', () => {
  it('accepts a non-empty title', () => {
    expect(isViableDraft('Hello', '', 0)).toBe(true);
  });

  it('accepts body text even when the title is blank', () => {
    expect(isViableDraft('  ', 'some body', 0)).toBe(true);
  });

  it('rejects a completely empty note', () => {
    expect(isViableDraft('', '', 0)).toBe(false);
    expect(isViableDraft('   ', '   ', 0)).toBe(false);
  });
});

describe('MemoryEditorModal backdrop click', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderEditor = (
    onSave = vi.fn().mockResolvedValue(undefined),
    onClose = vi.fn(),
  ) => {
    render(
      <MemoryEditorModal
        memory={null}
        nextOrderIndex={0}
        existingTags={['typescript']}
        onSave={onSave}
        onClose={onClose}
      />,
    );
    return { onSave, onClose };
  };

  it('invokes onSave when the backdrop is clicked and a title is present', async () => {
    const { onSave, onClose } = renderEditor();

    const title = await screen.findByPlaceholderText('Memory title…');
    fireEvent.change(title, { target: { value: 'Autosaved note' } });

    await waitFor(() => {
      expect(document.querySelector('.ProseMirror')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('editor-backdrop'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    expect(onSave.mock.calls[0][0].title).toBe('Autosaved note');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes without saving when the draft is empty', async () => {
    const { onSave, onClose } = renderEditor();

    await screen.findByPlaceholderText('Memory title…');
    fireEvent.click(screen.getByTestId('editor-backdrop'));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(onSave).not.toHaveBeenCalled();
  });
});
