import { parseDocument } from 'yaml';
import { minimatch } from 'minimatch';
import type { Diagnostic, RepoFile } from './types.js';

export interface Metadata { data: Record<string, unknown>; valid: boolean; startLine: number }

/** Parse bounded YAML frontmatter without resolving arbitrary YAML aliases. */
export function metadata(file: RepoFile, diagnostics: Diagnostic[]): Metadata {
  if (!/^---\r?\n/.test(file.content)) return { data: {}, valid: true, startLine: 1 };
  const match = file.content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  try {
    if (!match || match[1].length > 16_384) throw new Error('Frontmatter is unclosed or exceeds 16 KiB.');
    const document = parseDocument(match[1], { uniqueKeys: true });
    if (document.errors.length) throw new Error(document.errors[0].message);
    const value: unknown = document.toJS({ maxAliasCount: 0 });
    if (value !== null && (typeof value !== 'object' || Array.isArray(value))) throw new Error('Frontmatter must be a mapping.');
    return { data: (value ?? {}) as Record<string, unknown>, valid: true, startLine: match[0].split('\n').length };
  } catch (error) {
    diagnostics.push({ code: 'INVALID_FRONTMATTER', severity: 'warning', path: file.path, message: String(error instanceof Error ? error.message : error).split('\n')[0] });
    return { data: {}, valid: false, startLine: 1 };
  }
}

/** Split comma lists while preserving commas inside brace and bracket patterns. */
export function patterns(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.every(item => typeof item === 'string') ? value.flatMap(item => patterns(item) ?? []) : null;
  if (typeof value !== 'string') return null;
  const result: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '{' || value[i] === '[') depth++;
    if (value[i] === '}' || value[i] === ']') depth--;
    if (value[i] === ',' && depth === 0) { result.push(value.slice(start, i).trim()); start = i + 1; }
  }
  result.push(value.slice(start).trim());
  return result.filter(Boolean);
}

function safePattern(pattern: string): boolean {
  if (pattern.length > 1024 || /\{[^}]*\.\.[^}]*\}/.test(pattern)) return false;
  let expansion = 1;
  let groups = 0;
  for (const group of pattern.matchAll(/\{([^{}]*)\}/g)) {
    expansion *= group[1].split(',').length;
    groups++;
  }
  return expansion <= 1000 && groups <= 8 && (pattern.match(/\{/g)?.length ?? 0) === groups;
}

/** Match common file globs with explicit resource limits; null means unknown. */
export function matchPatterns(value: unknown, target: string, path: string, diagnostics: Diagnostic[]): boolean | null {
  const list = patterns(value);
  if (!list || !list.length || list.length > 128 || list.some(pattern => !safePattern(pattern))) {
    diagnostics.push({ code: 'UNSUPPORTED_GLOB', severity: 'warning', path, message: 'Expected 1–128 string globs, each at most 1,024 characters with bounded, non-nested brace expansion. Numeric brace ranges are not modeled.' });
    return null;
  }
  return list.some(pattern => minimatch(target, pattern.replace(/^\.\//, ''), { dot: true, nonegate: true, nocomment: true, noext: true }));
}
