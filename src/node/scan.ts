import { execFileSync } from 'node:child_process';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { isInstructionPath } from '../core/index.js';
import type { Diagnostic, RepoFile } from '../core/types.js';

const SKIP = new Set(['.git', 'node_modules', '.next', '.nuxt', '.cache', '.venv', 'venv', 'vendor', 'dist', 'dist-web', 'build', 'coverage', 'tmp', '.turbo']);
const MAX_FILES = 10_000;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

export interface Snapshot { files: RepoFile[]; diagnostics: Diagnostic[] }

/** Validate and normalize a repository-relative path without accessing it. */
export function repoPath(value: string, allowRoot = false): string {
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
  if (allowRoot && (normalized === '' || normalized === '.')) return '.';
  if (!normalized || isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized) || normalized.split('/').some(p => p === '..' || p === '') || /[\x00-\x1f]/.test(normalized)) {
    throw new Error('Paths must stay inside the repository and use relative file names.');
  }
  return normalized;
}

/** Read an instruction snapshot without following symlinks or reading home configuration. */
export async function scanRepository(inputRoot: string, fallbackNames: string[] = []): Promise<Snapshot> {
  const root = await realpath(resolve(inputRoot));
  if (!(await lstat(root)).isDirectory()) throw new Error('Repository root must be a directory.');
  const diagnostics: Diagnostic[] = [];
  let names: string[];
  try {
    names = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean);
    if (!names.length) throw new Error('git returned no files');
  } catch {
    names = await walk(root);
    diagnostics.push({ code: 'NO_GIT_INDEX', severity: 'info', message: 'No Git inventory available. Common build/cache folders are skipped; .gitignore is not interpreted.' });
  }
  names = [...new Set(names)].filter(name => !name.split('/').some(part => SKIP.has(part))).sort();
  if (names.length > MAX_FILES) {
    diagnostics.push({ code: 'FILE_LIMIT', severity: 'warning', message: `Repository has more than ${MAX_FILES} visible paths. Scan is incomplete; choose a smaller root.` });
    names = names.slice(0, MAX_FILES);
  }
  const files = new Map<string, RepoFile>();
  let totalBytes = 0;
  for (const name of names) files.set(name, { path: name, content: '' });
  const pending = names.filter(name => isInstructionPath(name) || fallbackNames.includes(basename(name)));
  const visited = new Set<string>();
  for (let index = 0; index < pending.length && index < MAX_FILES; index++) {
    const name = pending[index];
    if (visited.has(name)) continue;
    visited.add(name);
    let safe: string;
    try { safe = repoPath(name); } catch { continue; }
    const full = resolve(root, safe);
    try {
      const canonical = await realpath(full);
      if (canonical !== full || relative(root, canonical).split(sep).includes('..')) {
        diagnostics.push({ code: 'SYMLINK_SKIPPED', severity: 'warning', path: safe, message: 'Symlinked instruction or import skipped. Copy the file inside the repository to inspect it.' });
        files.delete(name);
        continue;
      }
      const stat = await lstat(full);
      if (!stat.isFile()) { files.delete(name); continue; }
      if (stat.size > MAX_FILE_BYTES || totalBytes + stat.size > MAX_TOTAL_BYTES) {
        diagnostics.push({ code: 'CONTENT_LIMIT', severity: 'warning', path: safe, message: 'Instruction skipped: 256 KiB per file or 8 MiB total content limit exceeded.' });
        files.delete(name);
        continue;
      }
      const content = await readFile(full, 'utf8');
      if (content.includes('\0')) {
        diagnostics.push({ code: 'BINARY_SKIPPED', severity: 'warning', path: safe, message: 'Binary instruction file skipped.' });
        files.delete(name);
        continue;
      }
      totalBytes += stat.size;
      files.set(name, { path: name, content });
      for (const match of content.matchAll(/(?:^|\s)@([^\s`<>"'()]+\.(?:md|mdc|txt))\b/gm)) {
        const target = relative(root, resolve(dirname(full), match[1])).split(sep).join('/');
        // Only imports in the repository inventory are eligible (including gitignore checks).
        if (files.has(target) && !visited.has(target)) pending.push(target);
      }
    } catch (error) {
      diagnostics.push({ code: 'READ_FAILED', severity: 'warning', path: safe, message: `Could not read instruction: ${(error as NodeJS.ErrnoException).code ?? 'unknown error'}.` });
      files.delete(name);
    }
  }
  return { files: [...files.values()], diagnostics };
}

async function walk(root: string): Promise<string[]> {
  const names: string[] = [];
  const directories = [''];
  while (directories.length && names.length <= MAX_FILES) {
    const directory = directories.shift()!;
    const entries = await readdir(resolve(root, directory), { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (SKIP.has(entry.name)) continue;
      const name = directory ? `${directory}/${entry.name}` : entry.name;
      if (entry.isDirectory()) directories.push(name);
      else names.push(name);
      if (names.length > MAX_FILES) break;
    }
    if (directories.length > MAX_FILES) break;
  }
  return names;
}
