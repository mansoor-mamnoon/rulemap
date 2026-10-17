import { PROFILES } from '../core/index.js';
import type { Inspection } from '../core/types.js';

export type Format = 'text' | 'json' | 'markdown' | 'html';

/** Make a report safe to share without instruction bodies; paths remain visible. */
export function redact(report: Inspection, includeContent: boolean): Inspection {
  return { ...report, rules: report.rules.map(rule => ({ ...rule, content: includeContent ? rule.content : '' })) };
}

/** Render one or more reports; all formats describe expected, not observed behavior. */
export function formatReports(reports: Inspection[], format: Format, includeContent: boolean): string {
  const safe = reports.map(report => redact(report, includeContent));
  if (format === 'json') return JSON.stringify(safe.length === 1 ? safe[0] : { schemaVersion: 1, reports: safe }, null, 2) + '\n';
  const sections = safe.map(report => {
    const lines = [
      `# Rulemap · ${PROFILES[report.profile].name}`,
      '', `File: ${clean(report.file)} | Launch directory: ${clean(report.cwd)}`,
      `Expected applicability · profile ${report.profileVersion}`, '',
    ];
    for (const rule of report.rules) {
      lines.push(`## ${rule.status.toUpperCase()} · ${clean(rule.path)}:${rule.startLine}-${rule.endLine}`, clean(rule.reason), '');
      if (includeContent && rule.content) lines.push(...rule.content.split('\n').map(line => `    ${clean(line)}`), '');
    }
    if (!report.rules.length) lines.push('No recognized instruction files found.', '');
    if (report.diagnostics.length) lines.push('## Diagnostics', ...report.diagnostics.map(d => `- [${d.severity}] ${clean(d.path ? `${d.path}: ` : '')}${clean(d.message)}`), '');
    lines.push('## Scope', ...report.assumptions.map(a => `- ${clean(a)}`), '', 'Generated locally with Rulemap · https://github.com/mansoor-mamnoon/rulemap');
    if (!includeContent) lines.push('Instruction text omitted. Repository paths are still visible.');
    return lines.join('\n');
  });
  const markdown = sections.join('\n\n---\n\n') + '\n';
  if (format === 'markdown') return markdown;
  if (format === 'html') return `<!doctype html>\n<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Rulemap report</title><style>body{font:15px/1.65 ui-monospace,monospace;max-width:1000px;margin:40px auto;padding:0 24px;background:#f7f8f2;color:#18231d}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#145c40}</style><body><pre>${escapeHtml(markdown)}</pre><a href="https://github.com/mansoor-mamnoon/rulemap">Rulemap on GitHub</a></body></html>\n`;
  return markdown.replace(/^#{1,2} /gm, '');
}

function clean(value: string): string {
  return value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
