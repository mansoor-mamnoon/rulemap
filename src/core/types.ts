/** Supported documentation-based profiles, frozen at the recorded date. */
export type Profile = 'codex' | 'claude' | 'cursor' | 'copilot';
export type RuleStatus = 'included' | 'excluded' | 'conditional';
/** Repository paths use forward slashes and are relative to the selected root. */
export interface RepoFile { path: string; content: string }
export interface InspectOptions {
  file: string;
  profile: Profile;
  cwd?: string;
  maxBytes?: number;
  fallbackNames?: string[];
}
export interface RuleResult {
  path: string;
  status: RuleStatus;
  reason: string;
  content: string;
  startLine: number;
  endLine: number;
  bytes: number;
  order?: number;
  importedFrom?: string;
}
export interface Diagnostic { code: string; severity: 'info' | 'warning' | 'error'; message: string; path?: string }
export interface Inspection {
  schemaVersion: 1;
  profile: Profile;
  profileVersion: string;
  file: string;
  cwd: string;
  rules: RuleResult[];
  diagnostics: Diagnostic[];
  totalBytes: number;
  assumptions: string[];
}
export interface Demo { id: string; title: string; description: string; file: string; cwd: string; files: RepoFile[] }
