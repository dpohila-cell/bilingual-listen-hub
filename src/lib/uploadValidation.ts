// Single source of truth for supported upload formats. Drives both the file
// picker filter (`accept`) and the visible hint, so they never drift apart.
export const ACCEPTED_FORMATS = ['.epub', '.fb2', '.txt', '.doc', '.docx', '.pdf', '.mobi', '.azw', '.azw3'];
export const FORMAT_LABEL = ACCEPTED_FORMATS.map((f) => f.replace('.', '').toUpperCase()).join(', ');
export const MAX_FILE_SIZE_MB = 25;
export const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

export function validateFile(file: File): string | null {
  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
  if (!ACCEPTED_FORMATS.includes(ext)) return `Unsupported file type. Allowed: ${FORMAT_LABEL}.`;
  if (file.size > MAX_FILE_SIZE) return `File is too large (max ${MAX_FILE_SIZE_MB} MB).`;
  return null;
}
