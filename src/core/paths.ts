/** Normalize a repository-relative path and reject paths outside its root. */
export function normalizePath(value: string, allowRoot = false): string {
  if (typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value) || /^(?:[/\\]|[a-zA-Z]:|~)/.test(value)) throw new Error('Paths must be relative to the repository root.');
  const parts: string[] = [];
  for (const part of value.replaceAll('\\', '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) throw new Error('Path escapes the repository root.');
      parts.pop();
    } else parts.push(part);
  }
  const path = parts.join('/');
  if (!path && !allowRoot) throw new Error('A file path is required.');
  return path;
}

/** Return the parent directory, using an empty string for the root. */
export function dirname(path: string): string { return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''; }

/** Test whether a directory contains a repository path. */
export function contains(directory: string, path: string): boolean { return !directory || path === directory || path.startsWith(`${directory}/`); }

/** List directories from the root through the supplied directory. */
export function ancestors(directory: string): string[] {
  const result = [''];
  if (directory) {
    const parts = directory.split('/');
    for (let i = 1; i <= parts.length; i++) result.push(parts.slice(0, i).join('/'));
  }
  return result;
}

/** Recognize instruction files supported or explicitly surfaced by Rulemap. */
export function isInstructionPath(path: string): boolean {
  return /(?:^|\/)(?:AGENTS(?:\.override)?\.md|CLAUDE(?:\.local)?\.md|GEMINI\.md|\.cursorrules)$/.test(path)
    || /(?:^|\/)\.claude\/rules\/.+\.md$/.test(path)
    || /(?:^|\/)\.cursor\/rules\/.+\.mdc?$/.test(path)
    || path === '.github/copilot-instructions.md'
    || /^\.github\/instructions\/.+\.instructions\.md$/.test(path);
}
