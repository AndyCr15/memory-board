import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EditTagsModal } from './EditTagsModal';

describe('EditTagsModal', () => {
  it('renames the tag chosen in the list', async () => {
    const onRename = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <EditTagsModal tags={['coffee', 'clean']} onClose={onClose} onRename={onRename} />,
    );

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'clean' } });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Cleaning' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onRename).toHaveBeenCalledWith('clean', 'cleaning');
    });
    expect(onClose).toHaveBeenCalled();
  });
});