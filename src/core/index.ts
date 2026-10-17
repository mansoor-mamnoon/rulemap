import type { Diagnostic, Inspection, InspectOptions, Profile, RepoFile, RuleResult, RuleStatus } from './types.js';
import { ancestors, contains, dirname, isInstructionPath, normalizePath } from './paths.js';
import { matchPatterns, metadata } from './metadata.js';
import { expandImports } from './imports.js';
export { isInstructionPath } from './paths.js';
export { DEMOS } from './examples.js';
export type * from './types.js';

/** Documentation snapshots, not installed agent versions or runtime observations. */
export const PROFILES: Record<Profile, { name: string; version: string; source: string; description: string }> = {
  codex: { name: 'Codex', version: '2026-10-17', source: 'https://learn.chatgpt.com/docs/agent-configuration/agents-md', description: 'Launch-time AGENTS.md discovery from root to working directory.' },
  claude: { name: 'Claude Code', version: '2026-10-17', source: 'https://code.claude.com/docs/en/memory', description: 'Default project memories, AGENTS fallback, path rules, and local imports.' },
  cursor: { name: 'Cursor', version: '2026-10-17', source: 'https://cursor.com/docs/rules', description: 'Project .mdc rules and AGENTS.md for a file in context.' },
  copilot: { name: 'Copilot cloud agent', version: '2026-10-17', source: 'https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions', description: 'GitHub cloud-agent repository and path instructions; not every Copilot client.' },
};

function result(file: RepoFile, status: RuleStatus, reason: string, startLine = 1): RuleResult {
  return { path: file.path, status, reason, content: file.content, startLine, endLine: file.content.split('\n').length, bytes: new TextEncoder().encode(file.content).length };
}

function scope(path: string, marker: string): string { return path.slice(0, path.indexOf(marker)).replace(/\/$/, ''); }
function join(directory: string, name: string): string { return directory ? `${directory}/${name}` : name; }
function hasMemory(files: Map<string, RepoFile>, directory: string): boolean {
  return ['CLAUDE.md', 'CLAUDE.local.md', '.claude/CLAUDE.md'].some(name => files.has(join(directory, name)));
}

function codexRules(files: Map<string, RepoFile>, candidates: RepoFile[], cwd: string, options: InspectOptions, diagnostics: Diagnostic[]): RuleResult[] {
  const names = ['AGENTS.override.md', 'AGENTS.md', ...(options.fallbackNames ?? [])];
  const chosen = new Map<string, string>();
  for (const directory of ancestors(cwd)) {
    const selected = names.map(name => files.get(join(directory, name))).find(file => file?.content.trim());
    if (selected) chosen.set(directory, selected.path);
  }
  let used = 0;
  const budget = options.maxBytes ?? 32768;
  return candidates.map(file => {
    const directory = dirname(file.path);
    if (!names.includes(file.path.split('/').at(-1)!)) return result(file, 'excluded', 'Not a Codex project instruction filename.');
    if (!contains(directory, cwd)) return result(file, 'excluded', `Outside the launch directory ancestry (${cwd || '.'}); selecting a target file does not change launch-time discovery.`);
    if (!file.content.trim()) return result(file, 'excluded', 'Empty instruction files are skipped.');
    const winner = chosen.get(directory);
    if (winner !== file.path) return result(file, 'excluded', `${winner} takes precedence in this directory; Codex selects one non-empty file per directory.`);
    const size = new TextEncoder().encode(file.content).length;
    if (used >= budget) return result(file, 'excluded', `The ${budget.toLocaleString('en-US')}-byte project instruction budget is already exhausted.`);
    used += size;
    if (used > budget) {
      diagnostics.push({ code: 'CODEX_BUDGET', severity: 'warning', path: file.path, message: `This instruction crosses the ${budget.toLocaleString('en-US')}-byte project budget. Exact truncation and separator overhead are not reproduced.` });
      return result(file, 'conditional', 'Selected by discovery, but only part may fit the byte budget. Full source shown for review.');
    }
    return result(file, 'included', `${file.path.endsWith('AGENTS.override.md') ? 'Override selected' : 'First non-empty candidate'} in the root-to-launch-directory chain.`);
  });
}

function claudeRule(file: RepoFile, files: Map<string, RepoFile>, target: string, cwd: string, diagnostics: Diagnostic[]): RuleResult {
  let directory = dirname(file.path);
  const ruleFile = /(?:^|\/)\.claude\/rules\/.+\.md$/.test(file.path);
  const memory = /(?:^|\/)CLAUDE(?:\.local)?\.md$/.test(file.path);
  const agents = /(?:^|\/)AGENTS\.md$/.test(file.path);
  if (ruleFile) directory = scope(file.path, '.claude/rules/');
  else if (/(?:^|\/)\.claude\/(?:CLAUDE|AGENTS)\.md$/.test(file.path)) directory = dirname(directory);
  if (!ruleFile && !memory && !agents) return result(file, 'excluded', 'Not a Claude project memory or rules file.');
  const startup = contains(directory, cwd);
  const onRead = contains(directory, target) && contains(cwd, directory);
  if (!startup && !onRead) return result(file, 'excluded', 'Outside the working directory ancestry and selected file subtree.');
  if (agents) {
    if (ancestors(cwd).some(parent => hasMemory(files, parent)) || hasMemory(files, directory)) return result(file, 'excluded', 'Default Claude profile prefers CLAUDE memory files; AGENTS.md can still load through an explicit @import.');
  }
  if (ruleFile) {
    const meta = metadata(file, diagnostics);
    if ('paths' in meta.data) {
      const matched = matchPatterns(meta.data.paths, target.slice(directory ? directory.length + 1 : 0), file.path, diagnostics);
      return result(file, matched === false ? 'excluded' : 'conditional', matched === false ? 'The paths patterns do not match the selected file.' : matched === null ? 'Cannot determine path matching for this metadata.' : 'The paths pattern matches; loads when Claude reads, writes, or edits this file.', meta.startLine);
    }
    return result(file, startup ? 'included' : 'conditional', !meta.valid ? 'Malformed frontmatter: documented Claude behavior treats this as an unscoped rule.' : startup ? 'Unscoped project rule loads at launch.' : 'Nested project rule becomes available when Claude works in this subtree.', meta.startLine);
  }
  return result(file, startup ? 'included' : 'conditional', startup ? agents ? 'Default AGENTS fallback: no CLAUDE memory exists in the launch ancestry (requires Claude Code 2.1.277+ with its built-in plugin enabled).' : 'Project memory in the launch directory ancestry.' : 'Nested memory loads when Claude opens a file in this subtree.');
}

function cursorRule(file: RepoFile, target: string, diagnostics: Diagnostic[]): RuleResult {
  if (/(?:^|\/)AGENTS\.md$/.test(file.path)) return result(file, contains(dirname(file.path), target) ? 'included' : 'excluded', contains(dirname(file.path), target) ? 'AGENTS.md applies to files in its directory subtree.' : 'The selected file is outside this AGENTS.md subtree.');
  if (file.path === '.cursorrules') return result(file, 'conditional', 'Legacy .cursorrules is deprecated; availability depends on the Cursor client/version.');
  if (!/(?:^|\/)\.cursor\/rules\/.+\.mdc$/.test(file.path)) return result(file, 'excluded', 'Not a Cursor .mdc project rule or AGENTS.md.');
  const directory = scope(file.path, '.cursor/rules/');
  if (!contains(directory, target)) return result(file, 'excluded', 'The selected file is outside this nested rule directory’s scope.');
  const meta = metadata(file, diagnostics);
  if (!meta.valid) return result(file, 'conditional', 'Invalid frontmatter; agent behavior cannot be inferred safely.');
  if (meta.data.alwaysApply === true) return result(file, 'included', 'alwaysApply: true; globs and description do not restrict this rule.', meta.startLine);
  if (meta.data.alwaysApply !== undefined && meta.data.alwaysApply !== false) {
    diagnostics.push({ code: 'INVALID_METADATA', severity: 'warning', path: file.path, message: 'alwaysApply must be a YAML boolean.' });
    return result(file, 'conditional', 'alwaysApply is not a boolean; inclusion is unknown.', meta.startLine);
  }
  if (meta.data.globs !== undefined && meta.data.globs !== '' && !(Array.isArray(meta.data.globs) && !meta.data.globs.length)) {
    const matched = matchPatterns(meta.data.globs, target.slice(directory ? directory.length + 1 : 0), file.path, diagnostics);
    return result(file, matched === null ? 'conditional' : matched ? 'included' : 'excluded', matched === null ? 'Cannot determine glob matching for this metadata.' : matched ? 'The globs pattern matches the selected file, assumed to be in context.' : 'The globs pattern does not match the selected file.', meta.startLine);
  }
  return result(file, 'conditional', meta.data.description ? 'Agent-requested rule: inclusion depends on the task and the model’s relevance decision.' : 'Manual rule: requires an explicit @mention in the conversation.', meta.startLine);
}

function copilotRule(file: RepoFile, target: string, diagnostics: Diagnostic[]): RuleResult {
  if (file.path === '.github/copilot-instructions.md') return result(file, 'included', 'Repository-wide GitHub Copilot instructions.');
  if (/(?:^|\/)AGENTS\.md$/.test(file.path)) return result(file, contains(dirname(file.path), target) ? 'included' : 'excluded', contains(dirname(file.path), target) ? 'Ancestor AGENTS.md; closer AGENTS.md files have precedence. Content conflicts are not inferred.' : 'Outside the selected file’s directory ancestry.');
  if (file.path === 'CLAUDE.md' || file.path === 'GEMINI.md') return result(file, 'conditional', 'Documented alternative agent instruction file; coexistence/selection with AGENTS.md is not specified by this profile.');
  if (!/^\.github\/instructions\/.+\.instructions\.md$/.test(file.path)) return result(file, 'excluded', 'Not a GitHub cloud-agent repository instruction file.');
  const meta = metadata(file, diagnostics);
  if (!meta.valid) return result(file, 'conditional', 'Invalid frontmatter; application is unknown.');
  if (meta.data.excludeAgent === 'cloud-agent') return result(file, 'excluded', 'excludeAgent: cloud-agent disables this rule for this profile.', meta.startLine);
  if (meta.data.excludeAgent !== undefined && meta.data.excludeAgent !== 'code-review') {
    diagnostics.push({ code: 'INVALID_METADATA', severity: 'warning', path: file.path, message: 'excludeAgent should be cloud-agent or code-review; unknown value is not modeled.' });
    return result(file, 'conditional', 'Unknown excludeAgent value.', meta.startLine);
  }
  const matched = matchPatterns(meta.data.applyTo, target, file.path, diagnostics);
  return result(file, matched === null ? 'conditional' : matched ? 'included' : 'excluded', matched === null ? 'Missing or unsupported applyTo patterns; application is unknown.' : matched ? 'applyTo matches the selected file for Copilot cloud agent.' : 'applyTo does not match the selected file.', meta.startLine);
}

/** Explain expected project instruction discovery without executing or calling an agent. */
export function inspect(input: RepoFile[], options: InspectOptions): Inspection {
  if (!Object.hasOwn(PROFILES, options.profile)) throw new Error(`Unknown profile: ${String(options.profile)}`);
  const file = normalizePath(options.file);
  const cwd = normalizePath(options.cwd ?? '', true);
  if (options.maxBytes !== undefined && (!Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0)) throw new Error('maxBytes must be a positive safe integer.');
  for (const name of options.fallbackNames ?? []) if (!name || normalizePath(name) !== name || name.includes('/')) throw new Error('Fallback names must be simple filenames.');
  if (input.length > 10_000) throw new Error('Rulemap supports at most 10,000 supplied files.');
  const diagnostics: Diagnostic[] = [];
  const files = new Map<string, RepoFile>();
  let inputBytes = 0;
  for (const item of input) {
    const path = normalizePath(item.path);
    if (files.has(path)) throw new Error(`Duplicate repository path: ${path}`);
    inputBytes += new TextEncoder().encode(item.content).length;
    if (inputBytes > 8 * 1024 * 1024) throw new Error('Supplied content exceeds Rulemap’s 8 MiB limit.');
    files.set(path, { path, content: item.content });
  }
  const candidates = Array.from(files.values()).filter(item => isInstructionPath(item.path) || (options.fallbackNames ?? []).includes(item.path.split('/').at(-1)!));
  candidates.sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path, 'en'));
  let rules: RuleResult[];
  if (options.profile === 'codex') rules = codexRules(files, candidates, cwd, options, diagnostics);
  else if (options.profile === 'claude') {
    rules = candidates.map(item => claudeRule(item, files, file, cwd, diagnostics));
    expandImports(rules, files, diagnostics);
  } else if (options.profile === 'cursor') rules = candidates.map(item => cursorRule(item, file, diagnostics));
  else rules = candidates.map(item => copilotRule(item, file, diagnostics));
  let order = 0;
  for (const rule of rules) if (rule.status !== 'excluded') rule.order = ++order;
  if (!files.has(file)) diagnostics.push({ code: 'TARGET_NOT_SUPPLIED', severity: 'info', path: file, message: 'Target path was not present in supplied files. Matching is hypothetical, so new files can be inspected before creation.' });
  if (!candidates.length) diagnostics.push({ code: 'NO_RULES', severity: 'info', message: 'No supported instruction files were found in the supplied repository.' });
  const assumptions = [
    'Static documentation-based estimate, not a trace of an agent session or a guarantee of model behavior.',
    'Only supplied repository files are considered. User, organization, home-directory settings, runtime prompts, skills, hooks, and history are not modeled.',
    'Shown source bytes include frontmatter and comments. They are not exact prompt size or token counts.',
    'Order is a stable review order; it is not an exact prompt serialization. No natural-language conflicts are resolved.',
  ];
  if (options.profile === 'codex') assumptions.push(`Codex launch directory: ${cwd || '.'}. Default project byte budget: 32 KiB; global instructions and exact boundary truncation are outside this model.`);
  if (options.profile === 'claude') assumptions.push('Default Claude project instruction setting, AGENTS built-in plugin enabled on 2.1.277+, all setting sources enabled, no excludes. On-read loading is conditional. Imports stay inside the supplied repository and are capped at four hops, 128 files, and 1 MiB.');
  if (options.profile === 'cursor') assumptions.push('The selected file is in context. Common globs use minimatch with dotfiles, no negation or extglobs, relative to the rule’s project directory. Team/User rules and model relevance are outside this model.');
  if (options.profile === 'copilot') assumptions.push('GitHub Copilot cloud agent profile only. Repository instructions are enabled. Client variants, chat, code review, and alternative agent file selection are not modeled.');
  return { schemaVersion: 1, profile: options.profile, profileVersion: PROFILES[options.profile].version, file, cwd, rules, diagnostics, totalBytes: rules.filter(rule => rule.status === 'included').reduce((sum, rule) => sum + rule.bytes, 0), assumptions };
}
