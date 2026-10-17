import type { Diagnostic, RepoFile, RuleResult } from './types.js';
import { dirname, normalizePath } from './paths.js';

/** Extract Claude-style imports outside inline and fenced Markdown code. */
export function importPaths(content: string): string[] {
  const lines = content.split('\n');
  const prose: string[] = [];
  let fence = '';
  for (const line of lines) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = '';
      continue;
    }
    if (!fence) prose.push(line);
  }
  const text = prose.join('\n').replace(/(`+)[\s\S]*?\1/g, '');
  return Array.from(text.matchAll(/(?:^|\s|\()@((?:\\ |[^\s`"'<>()[\]])+)/g), match => match[1].replaceAll('\\ ', ' '));
}

/** Expand local Claude imports, preserving their parent's inclusion uncertainty. */
export function expandImports(rules: RuleResult[], files: Map<string, RepoFile>, diagnostics: Diagnostic[]): void {
  const queue = rules.filter(rule => rule.status !== 'excluded').map(rule => ({ rule, depth: 0, chain: [rule.path] }));
  const visited = new Set(queue.map(item => item.rule.path));
  let expanded = 0;
  let bytes = 0;
  for (let index = 0; index < queue.length; index++) {
    const { rule, depth, chain } = queue[index];
    for (const reference of importPaths(rule.content)) {
      if (expanded >= 128 || bytes >= 1024 * 1024) {
        diagnostics.push({ code: 'IMPORT_LIMIT', severity: 'warning', path: rule.path, message: 'Stopped import expansion at Rulemap’s 128-file / 1 MiB limit.' });
        return;
      }
      if (depth >= 4) {
        diagnostics.push({ code: 'IMPORT_DEPTH', severity: 'warning', path: rule.path, message: 'Import exceeds the documented four-hop limit.' });
        continue;
      }
      let path: string;
      try {
        if (/^(?:[/\\~]|[a-zA-Z]:)/.test(reference)) throw new Error('External import');
        path = normalizePath(`${dirname(rule.path)}/${reference}`.replace(/^\//, ''));
      } catch {
        diagnostics.push({ code: 'EXTERNAL_IMPORT', severity: 'warning', path: rule.path, message: `Import ${reference} is outside the selected repository; it was not read.` });
        continue;
      }
      if (chain.includes(path)) {
        diagnostics.push({ code: 'IMPORT_CYCLE', severity: 'warning', path: rule.path, message: `Circular import to ${path}; expansion stopped.` });
        continue;
      }
      const file = files.get(path);
      if (!file) {
        diagnostics.push({ code: 'MISSING_IMPORT', severity: 'warning', path: rule.path, message: `Import ${path} is absent from the supplied files. It may be missing, ignored, unreadable, or outside the import reader’s supported formats.` });
        continue;
      }
      if (visited.has(path)) continue;
      visited.add(path);
      expanded++;
      const size = new TextEncoder().encode(file.content).length;
      bytes += size;
      if (bytes > 1024 * 1024) {
        diagnostics.push({ code: 'IMPORT_LIMIT', severity: 'warning', path, message: 'Import would exceed Rulemap’s 1 MiB expansion budget.' });
        return;
      }
      const existing = rules.find(item => item.path === path);
      const imported: RuleResult = {
        path, content: file.content, bytes: size, status: rule.status,
        reason: `Imported by @path from ${rule.path}${rule.status === 'conditional' ? '; depends on that file loading' : ''}.`,
        startLine: 1, endLine: file.content.split('\n').length, importedFrom: rule.path,
      };
      if (existing) Object.assign(existing, imported);
      else rules.push(imported);
      queue.push({ rule: existing ?? imported, depth: depth + 1, chain: [...chain, path] });
    }
  }
}
