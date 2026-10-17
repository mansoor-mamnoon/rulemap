import { isInstructionPath } from '../core/index';
import type { RepoFile } from '../core/types';

const MAX_FILES = 10_000;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

export interface ImportResult {
  files: RepoFile[];
  name: string;
  target: string;
  messages: string[];
}

/** Read instruction files from a browser directory picker. Files never leave the page. */
export async function importDirectory(entries: File[]): Promise<ImportResult> {
  const messages: string[] = [];
  if (!entries.length) throw new Error('No files selected.');
  const prefix = commonPrefix(entries.map(f => f.webkitRelativePath));
  const name = prefix.split('/')[0] || 'Opened folder';

  const candidates: { path: string; file: File }[] = [];
  for (const file of entries) {
    const path = file.webkitRelativePath.slice(prefix.length).replace(/\\/g, '/');
    if (!path || path.startsWith('.git/') || path.includes('/node_modules/') || path.includes('/.git/')) continue;
    candidates.push({ path, file });
  }

  if (candidates.length > MAX_FILES) {
    messages.push(`This folder has ${candidates.length.toLocaleString()} files. Only instruction files are read.`);
  }

  const instructionEntries = candidates.filter(c => isInstructionPath(c.path));
  const files: RepoFile[] = [];
  let totalBytes = 0;

  for (const entry of instructionEntries) {
    if (entry.file.size > MAX_FILE_BYTES) {
      messages.push(`Skipped ${entry.path}: exceeds 256 KiB.`);
      continue;
    }
    if (totalBytes + entry.file.size > MAX_TOTAL_BYTES) {
      messages.push('Total content limit reached (8 MiB). Some files were skipped.');
      break;
    }
    const content = await readText(entry.file);
    if (content.includes('\0')) {
      messages.push(`Skipped ${entry.path}: binary file.`);
      continue;
    }
    totalBytes += entry.file.size;
    files.push({ path: entry.path, content });
  }

  for (const entry of candidates) {
    if (!files.some(f => f.path === entry.path)) {
      files.push({ path: entry.path, content: '' });
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));

  const target = files.find(f => /\.(ts|js|tsx|jsx|py|go|rs|rb|java|c|cpp|cs)$/.test(f.path))?.path
    ?? files.find(f => !isInstructionPath(f.path))?.path
    ?? files[0]?.path
    ?? '';

  return { files, name, target, messages };
}

function commonPrefix(paths: string[]): string {
  if (!paths.length) return '';
  const parts = paths[0].split('/');
  let depth = parts.length;
  for (const path of paths) {
    const segments = path.split('/');
    depth = Math.min(depth, segments.length);
    for (let i = 0; i < depth; i++) {
      if (segments[i] !== parts[i]) { depth = i; break; }
    }
  }
  return parts.slice(0, depth).join('/') + (depth ? '/' : '');
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsText(file);
  });
}
