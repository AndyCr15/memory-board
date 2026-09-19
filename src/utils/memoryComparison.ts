import type { Memory, MemoryAttachment } from '../types/memory';
import { resolveMemoryTheme } from '../types/memory';

const trimmed = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const sortedTagsKey = (tags: unknown): string => {
  const list = Array.isArray(tags)
    ? tags.filter((tag): tag is string => typeof tag === 'string')
    : [];
  return [...list].sort().join(',');
};

/**
 * Attachment identity for dedup: order-independent, ignores local `id` and
 * blob `data` so a re-import of the same backup matches the tenant cache.
 */
const attachmentFingerprint = (att: Partial<MemoryAttachment> | Record<string, unknown>): string =>
  JSON.stringify({
    name: typeof att.name === 'string' ? att.name : '',
    size: typeof att.size === 'number' ? att.size : 0,
    mimeType: typeof att.mimeType === 'string' ? att.mimeType : '',
    storedFilename: typeof att.storedFilename === 'string' ? att.storedFilename : '',
  });

const sortedAttachmentsKey = (attachments: unknown): string => {
  const list = Array.isArray(attachments) ? attachments : [];
  return list
    .map((att) =>
      att && typeof att === 'object'
        ? attachmentFingerprint(att as Record<string, unknown>)
        : '',
    )
    .sort()
    .join('|');
};

/**
 * Strict content/metadata equality.  `id` and `updatedAt` are ignored.
 */
export const isExactMemoryMatch = (
  existing: Memory,
  candidate: Partial<Memory>,
): boolean => {
  if (existing.title.trim() !== trimmed(candidate.title)) return false;
  if (existing.contentText.trim() !== trimmed(candidate.contentText)) return false;
  if (existing.contentHtml.trim() !== trimmed(candidate.contentHtml)) return false;
  if (resolveMemoryTheme(existing.colorTheme) !== resolveMemoryTheme(candidate.colorTheme)) {
    return false;
  }
  if (Boolean(existing.isPinned) !== Boolean(candidate.isPinned)) return false;
  if (existing.createdAt !== candidate.createdAt) return false;
  if (sortedTagsKey(existing.tags) !== sortedTagsKey(candidate.tags)) return false;
  if (sortedAttachmentsKey(existing.attachments) !== sortedAttachmentsKey(candidate.attachments)) {
    return false;
  }
  return true;
};

export const findExactDuplicate = (
  candidate: Partial<Memory>,
  existingMemories: Memory[],
): Memory | undefined =>
  existingMemories.find((existing) => isExactMemoryMatch(existing, candidate));
