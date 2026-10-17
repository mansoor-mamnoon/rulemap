import { parseArgs } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { inspect, DEMOS, PROFILES } from './core/index.js';
import type { Inspection, Profile } from './core/types.js';
import { scanRepository, repoPath } from './node/scan.js';
import { formatReports, type Format } from './node/format.js';
import { serve } from './node/server.js';
import pkg from '../package.json' with { type: 'json' };

const HELP = `Rulemap ${pkg.version} — See which instructions your coding agent loads, and why.

Usage:
  rulemap inspect [root] --file <path> [options]
  rulemap explain [root] --file <path> [options]
  rulemap compare [root] --file <path> [--profiles codex,claude]
  rulemap demo [--web] [--example <id>]
  rulemap profiles

Options:
  --profile <name>       codex (default), claude, cursor, copilot (cloud agent)
  --cwd <path>           Agent launch directory relative to root (default: .)
  --format <format>      text, json, markdown, html (default: text)
  --output <path>        Write a report to this file
  --include-content     Include instruction text in exports (paths always shown)
  --web                 Open an interactive local report; Ctrl+C stops it
  --no-open             Print the local URL without opening your browser
  --port <number>       Local report port (default: choose a free port)
  --max-bytes <number>   Codex instruction budget (default: 32768)
  --fallback <name>      Extra Codex instruction filename; repeatable
  --fail-on-warnings    Exit 2 if scan/resolver warnings or errors are present
  --help                Show this help
  --version             Show version

Read-only. No API key, telemetry, inference or repository upload.
Profiles model documented repository rules, not observed model behavior.
Home/managed settings, custom Codex config and runtime history are not read.
`;

function profile(value: string): Profile {
  if (!Object.hasOwn(PROFILES, value)) throw new Error(`Unknown profile "${value}". Use: ${Object.keys(PROFILES).join(', ')}.`);
  return value as Profile;
}

function integer(value: string | undefined, fallback: number, name: string, maximum: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > maximum || (name === 'max-bytes' && Number(value) === 0)) throw new Error(`Invalid --${name}. Expected an integer between ${name === 'port' ? 0 : 1} and ${maximum}.`);
  return Number(value);
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    file: { type: 'string' }, profile: { type: 'string', default: 'codex' }, profiles: { type: 'string', default: 'codex,claude' },
    cwd: { type: 'string', default: '.' }, format: { type: 'string', default: 'text' }, output: { type: 'string' },
    'include-content': { type: 'boolean', default: false }, web: { type: 'boolean', default: false },
    'no-open': { type: 'boolean', default: false }, port: { type: 'string' },
    'max-bytes': { type: 'string' }, fallback: { type: 'string', multiple: true },
    example: { type: 'string' }, 'fail-on-warnings': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
  } });
  if (values.version) { console.log(pkg.version); return; }
  if (values.help || positionals.length === 0) { console.log(HELP); return; }
  const [command, root = '.'] = positionals;
  if (command === 'profiles') { console.log(Object.values(PROFILES).map(p => `${p.name} · ${p.version}\n${p.description}\n${p.source}`).join('\n\n')); return; }
  if (!['inspect', 'explain', 'compare', 'demo'].includes(command) || positionals.length > 2) throw new Error('Unknown command or extra arguments. Run rulemap --help.');
  if (!['text', 'json', 'markdown', 'html'].includes(values.format)) throw new Error('Unsupported --format. Use text, json, markdown, or html.');
  const selectedProfile = profile(values.profile);
  const cwd = repoPath(values.cwd, true);
  const maxBytes = integer(values['max-bytes'], 32768, 'max-bytes', 8 * 1024 * 1024);
  const port = integer(values.port, 0, 'port', 65535);
  const fallbackNames = (values.fallback ?? []).map(name => {
    if (name.includes('/') || name.includes('\\') || name === '.' || name === '..') throw new Error('--fallback must be a filename, not a path.');
    return repoPath(name);
  });
  const demo = command === 'demo' ? (values.example ? DEMOS.find(d => d.id === values.example) : DEMOS[0]) : undefined;
  if (command === 'demo' && !demo) throw new Error(`Unknown example. Use: ${DEMOS.map(d => d.id).join(', ')}.`);
  const file = repoPath(values.file ?? demo?.file ?? '');
  const snapshot = demo ? { files: demo.files, diagnostics: [] } : await scanRepository(root, fallbackNames);
  const launch = demo && values.cwd === '.' ? demo.cwd : cwd;
  const selectedProfiles = command === 'compare' ? values.profiles.split(',').map(profile) : [selectedProfile];
  if (command === 'compare' && (selectedProfiles.length !== 2 || new Set(selectedProfiles).size !== 2)) throw new Error('--profiles must contain two different profiles, for example codex,claude.');
  const reports: Inspection[] = selectedProfiles.map(p => {
    const report = inspect(snapshot.files, { file, cwd: launch, profile: p, maxBytes, fallbackNames });
    report.diagnostics.push(...snapshot.diagnostics);
    return report;
  });
  const result = formatReports(reports, values.format as Format, values['include-content']);
  if (values.output) { await writeFile(values.output, result, { flag: 'wx' }); console.error(`Report saved: ${values.output}`); }
  else if (!values.web) process.stdout.write(result);
  if (values.web) {
    const url = await serve({ ...snapshot, file, cwd: launch, profile: selectedProfile }, port);
    console.log(`Rulemap is ready: ${url}\nSnapshot captured at launch. Press Ctrl+C to stop.`);
    if (!values['no-open'] && !process.env.CI) {
      const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
      execFile(opener, [url], () => { /* The printed URL remains usable if no browser is installed. */ });
    }
  }
  if (values['fail-on-warnings'] && reports.some(r => r.diagnostics.some(d => d.severity !== 'info'))) process.exitCode = 2;
}

main().catch((error: Error) => { console.error(`rulemap: ${error.message}`); process.exitCode = 1; });
