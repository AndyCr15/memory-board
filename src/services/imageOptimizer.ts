// =============================================================================
// Memory Board – Image Optimiser Service
//
// Intercepts pasted / dropped images before they enter the editor or storage:
//   1. Loads the image into a hidden <img> element.
//   2. Draws it onto an offscreen <canvas>, scaling to fit MAX_DIMENSION.
//   3. Exports the canvas as WebP (with JPEG fallback) at QUALITY.
//
// Data flow:
//   File/Blob → loadImage() → resizeOnCanvas() → canvas.toBlob() → Blob
//   optimizeImage() orchestrates all three steps.
//   blobToDataUrl() converts the resulting Blob to a base64 data-URL for
//   embedding directly in TipTap's HTML content.
// =============================================================================

const MAX_DIMENSION = 1600; // px – longest edge after resize
const PREFERRED_FORMAT = 'image/webp';
const FALLBACK_FORMAT = 'image/jpeg';
const QUALITY = 0.85;
const MAX_FILE_BYTES = 1 * 1024 * 1024; // 1 MB

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Reads a Blob into an HTMLImageElement so we can measure its natural dimensions.
 * Creates and revokes an object URL to avoid memory leaks.
 */
const loadImage = (blob: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image.'));
    };
    img.src = url;
  });

/**
 * Draws `img` onto an offscreen canvas at the target dimensions and returns
 * the compressed Blob. Falls back to JPEG if WebP is not supported.
 */
const resizeOnCanvas = (
  img: HTMLImageElement,
  width: number,
  height: number,
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas 2D context unavailable.'));
      return;
    }

    ctx.drawImage(img, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          // WebP may be unsupported; try JPEG
          canvas.toBlob(
            (fallback) => {
              if (fallback) resolve(fallback);
              else reject(new Error('canvas.toBlob() returned null.'));
            },
            FALLBACK_FORMAT,
            QUALITY,
          );
        }
      },
      PREFERRED_FORMAT,
      QUALITY,
    );
  });

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Optimises an image file:
 *  - Scales it down proportionally so the longest edge ≤ MAX_DIMENSION.
 *  - Compresses to WebP (JPEG fallback) at QUALITY.
 *
 * Throws if the image cannot be decoded.
 */
export const optimizeImage = async (file: File | Blob): Promise<Blob> => {
  const img = await loadImage(file);

  let { naturalWidth: w, naturalHeight: h } = img;

  // Proportional downscale only (never upscale)
  if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
    const scale = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  return resizeOnCanvas(img, w, h);
};

/**
 * Validates that a file is within the 1 MB attachment size limit.
 * Throws a descriptive Error if it is too large.
 */
export const validateFileSize = (file: File): void => {
  if (file.size > MAX_FILE_BYTES) {
    const sizeMb = (file.size / 1024 / 1024).toFixed(2);
    throw new Error(
      `"${file.name}" is ${sizeMb} MB – attachments must be under 1 MB.`,
    );
  }
};

/**
 * Converts a Blob to a base64 data-URL string (e.g. "data:image/webp;base64,…").
 * Used to embed optimised images directly into TipTap's contentHtml.
 */
export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('FileReader failed.'));
    reader.readAsDataURL(blob);
  });

/** Formats a byte count as a human-readable string (KB / MB). */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};
