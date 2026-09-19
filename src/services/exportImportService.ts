// =============================================================================
// Memory Board – Export / Import Service
//
// Export (ZIP):
//   manifest.json          – version header + serialised memory records.
//                            Inline editor images remain embedded as data-URLs
//                            in contentHtml; only auxiliary attachments are
//                            written as separate binary files.
//   attachments/<id>       – raw attachment blobs, keyed by attachment ID.
//
// Import (ZIP):
//   1. Load and validate manifest.json.
//   2. Read each attachment blob from attachments/<id>.
//   3. Clear existing IndexedDB data.
//   4. Restore every memory + attachment into IndexedDB.
//   5. Return the count of restored memories for the success toast.
//
// Data flow:
//   IndexedDB → getAllMemories() → JSZip → FileSaver  (export)
//   File       → JSZip.loadAsync → clearAllData + saveMemory  (import)
// =============================================================================

import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { getAllMemories, saveMemory, clearAllData } from './database';
import type { Memory, MemoryAttachment } from '../types/memory';

// ---------------------------------------------------------------------------
// Manifest schema
// ---------------------------------------------------------------------------

const MANIFEST_FILENAME = 'manifest.json';
const ATTACHMENTS_FOLDER = 'attachments/';
const EXPORT_VERSION = 1;

/** Attachment metadata stored in the manifest (blob is a separate ZIP entry). */
interface AttachmentMeta {
  id: string;
  name: string;
  size: number;
  mimeType: string;
}

/** Per-memory record in the manifest. */
interface ManifestMemory extends Omit<Memory, 'attachments'> {
  attachments: AttachmentMeta[];
}

/** Root manifest structure. */
interface ExportManifest {
  version: typeof EXPORT_VERSION;
  exportedAt: number;
  memories: ManifestMemory[];
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Serialises all IndexedDB data into a ZIP archive and triggers a browser
 * download via FileSaver.
 *
 * The archive contains:
 *   manifest.json        – memory records (attachments field = metadata only)
 *   attachments/<id>     – one binary file per auxiliary attachment
 */
export const exportBackup = async (): Promise<void> => {
  const memories = await getAllMemories();

  const zip = new JSZip();
  const attachmentsFolder = zip.folder(ATTACHMENTS_FOLDER)!;
  const manifestMemories: ManifestMemory[] = [];

  for (const memory of memories) {
    const attachmentMetas: AttachmentMeta[] = [];

    for (const att of memory.attachments) {
      // Normalise to Blob before writing to ZIP
      const blob =
        att.data instanceof Blob
          ? att.data
          : att.data
            ? new Blob([att.data], { type: att.mimeType })
            : null;

      if (blob && blob.size > 0) {
        attachmentsFolder.file(att.id, blob);
      }

      attachmentMetas.push({
        id: att.id,
        name: att.name,
        size: att.size,
        mimeType: att.mimeType,
      });
    }

    const { attachments: _unused, ...rest } = memory;
    manifestMemories.push({ ...rest, attachments: attachmentMetas });
  }

  const manifest: ExportManifest = {
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    memories: manifestMemories,
  };

  zip.file(MANIFEST_FILENAME, JSON.stringify(manifest, null, 2));

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const filename = `memory-board-${new Date().toISOString().slice(0, 10)}.zip`;
  saveAs(zipBlob, filename);
};

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Restores memories from a backup ZIP file.
 *
 * @throws Error if the ZIP is invalid, the manifest is missing or the version
 *               is unrecognised.
 * @returns The number of memories successfully restored.
 */
export const importBackup = async (file: File): Promise<{ count: number }> => {
  // 1 – Parse the ZIP
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('The selected file is not a valid ZIP archive.');
  }

  // 2 – Read manifest
  const manifestFile = zip.file(MANIFEST_FILENAME);
  if (!manifestFile) {
    throw new Error(`Invalid backup: "${MANIFEST_FILENAME}" not found in archive.`);
  }

  let manifest: ExportManifest;
  try {
    const text = await manifestFile.async('text');
    manifest = JSON.parse(text) as ExportManifest;
  } catch {
    throw new Error('Could not parse manifest.json – file may be corrupted.');
  }

  if (manifest.version !== EXPORT_VERSION) {
    throw new Error(
      `Unsupported backup version "${manifest.version}". Expected ${EXPORT_VERSION}.`,
    );
  }

  // 3 – Clear existing data (full replacement import)
  await clearAllData();

  // 4 – Restore memories
  let count = 0;
  for (const raw of manifest.memories) {
    const attachments: MemoryAttachment[] = [];

    // Restore each auxiliary attachment blob from the ZIP
    for (const meta of raw.attachments) {
      const entry = zip.file(`${ATTACHMENTS_FOLDER}${meta.id}`);
      if (!entry) {
        console.warn(`Attachment "${meta.id}" (${meta.name}) not found in ZIP – skipped.`);
        continue;
      }

      const arrayBuffer = await entry.async('arraybuffer');
      const blob = new Blob([arrayBuffer], { type: meta.mimeType });

      attachments.push({
        id: meta.id,
        name: meta.name,
        size: meta.size,
        mimeType: meta.mimeType,
        data: blob,
      });
    }

    const memory: Memory = { ...raw, attachments };
    await saveMemory(memory);
    count++;
  }

  return { count };
};
