import { DEMOS, PROFILES, inspect } from '../core/index';
import type { Diagnostic, Inspection, Profile, RepoFile, RuleResult } from '../core/types';
import { importDirectory } from './import';
import './style.css';

const INSTALL = 'npx --yes --package=https://github.com/mansoor-mamnoon/rulemap/releases/download/v0.1.0/rulemap-0.1.0.tgz rulemap inspect . --file src/auth.ts --web';
const PROFILE_KEYS: Profile[] = ['codex', 'claude', 'cursor', 'copilot'];
const initialDemo = DEMOS[0];
let files = initialDemo.files.map(copyFile);
let originalFiles = initialDemo.files.map(copyFile);
let activeDemo = initialDemo.id;
let sourceName = 'Example repository';
let profile: Profile = 'codex';
let compareProfile: Profile = 'claude';
let target = initialDemo.file;
let cwd = initialDemo.cwd;
let mode: 'map' | 'compare' = 'map';
let selectedPath = files[0]?.path ?? '';
let snapshotDiagnostics: Diagnostic[] = [];
let currentInspection: Inspection;

/** Return an independent copy of a repository text file. */
function copyFile(file: RepoFile): RepoFile { return { ...file }; }

/** Find a required element in the static application shell. */
function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing application element: ${id}`);
  return found as T;
}

/** Build a text-only DOM node, including for untrusted repository content. */
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  result.className = className;
  result.textContent = text;
  return result;
}

const app = element('app');
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="./" aria-label="Rulemap home"><img src="./favicon.svg" width="30" height="30" alt="" />rulemap<span class="version">v0.1</span></a>
    <div class="topbar-right"><span class="privacy"><span class="live-dot"></span> Local by design</span><a class="github-link" href="https://github.com/mansoor-mamnoon/rulemap" target="_blank" rel="noreferrer"><span aria-hidden="true">☆</span> Star on GitHub <span class="arrow" aria-hidden="true">↗</span></a></div>
  </header>
  <div class="layout">
    <aside class="sidebar" aria-label="Repository and examples">
      <div class="sidebar-heading"><span class="eyebrow">WORKSPACE</span><span class="pill" id="workspace-kind">DEMO</span></div>
      <h2 id="source-name">Example repository</h2><p class="small muted" id="source-note">A real resolver. A sample repo.<br>Try a scenario to see what changes.</p>
      <div class="scenario-label eyebrow">TRY A SCENARIO</div><div class="presets" id="presets"></div>
      <div class="file-heading"><h3 class="eyebrow">INSTRUCTION FILES</h3><span id="file-count" class="file-count"></span></div>
      <div id="file-list" class="file-list"></div>
      <div class="import-area"><button class="button import-button" id="import-button"><span aria-hidden="true">＋</span> Open your folder</button><input id="folder-input" type="file" webkitdirectory multiple hidden /><p class="small muted">Read locally in your browser.<br>Your files never leave this device.</p></div>
      <div class="sidebar-bottom"><span class="tiny-mark" aria-hidden="true">↳</span><p>Find the rule.<br>Understand the scope.</p></div>
    </aside>
    <main>
      <section class="intro"><div class="eyebrow intro-kicker"><span class="mini-square"></span> THE INSTRUCTION DEBUGGER</div><h1>Your agent has rules.<br><span>Which ones actually apply?</span></h1><p>Follow the instructions from repo to file. Catch hidden overrides.<br class="desktop-break"> Compare agents before you wonder why they disagree.</p></section>
      <div class="notice" id="notice" role="status" hidden></div>
      <section class="config" aria-label="Inspection settings">
        <label class="field target-field"><span>Target file <span class="field-hint">relative to repository</span></span><div class="input-with-icon"><span aria-hidden="true">↳</span><input id="target" spellcheck="false" aria-label="Target file" /></div></label>
        <label class="field cwd-field"><span>Launch directory <span class="hint-icon" title="The repository-relative directory where the agent starts. It can affect which instructions load.">ⓘ</span></span><input id="cwd" spellcheck="false" aria-label="Launch directory" /></label>
        <label class="field agent-field"><span>Agent profile</span><select id="profile" aria-label="Agent profile"></select></label>
      </section>
      <div class="view-toolbar"><div class="tabs" role="tablist" aria-label="Inspection view"><button id="map-tab" role="tab" aria-selected="true" aria-controls="map-panel">Instruction map</button><button id="compare-tab" role="tab" aria-selected="false" aria-controls="compare-panel" tabindex="-1">Compare agents <span aria-hidden="true">⇄</span></button></div><span class="deterministic"><span class="live-dot"></span> Deterministic preview</span></div>
      <section id="map-panel" role="tabpanel" aria-labelledby="map-tab"><div class="map-layout"><div class="results"><div class="result-heading"><div><h2 id="result-title">The instruction chain</h2><p id="result-subtitle" class="small muted"></p></div><span class="count-label" id="bytes"></span></div><div class="legend" id="legend"></div><div id="rule-list" class="rule-list"></div><div id="diagnostics" class="diagnostics"></div></div><aside class="editor-panel" aria-label="Instruction editor"><div class="editor-top"><span class="eyebrow">SOURCE PREVIEW</span><span id="edited-badge" class="edited-badge" hidden>EDITED</span></div><h3 id="editor-path"></h3><p class="small muted">Edit a rule. Watch the map update.</p><label class="sr-only" for="editor">Instruction content</label><textarea id="editor" spellcheck="false" aria-label="Instruction content"></textarea><div class="editor-footer"><span class="small muted" id="editor-meta"></span><button class="text-button" id="reset-button">Reset edits ↺</button></div><p class="editor-note">Edits stay in this tab. No files are written.</p></aside></div></section>
      <section id="compare-panel" role="tabpanel" aria-labelledby="compare-tab" hidden><div class="compare-header"><div><h2>Same repository. Different rules.</h2><p class="small muted">See each profile’s result for the same file and launch directory.</p></div><label class="field"><span>Compare with</span><select id="compare-profile" aria-label="Compare with"></select></label></div><div id="comparison" class="comparison"></div></section>
      <section class="assumptions"><button id="assumptions-toggle" class="assumptions-toggle" aria-expanded="false" aria-controls="assumptions-content"><span>What this preview can tell you</span><span aria-hidden="true">＋</span></button><div id="assumptions-content" hidden><p>This is a documentation-based model of repository instructions, not a trace of an agent session. Settings, user-level rules, conversation context, and tool behavior can change what an agent actually sees.</p><ul id="assumptions-list"></ul><a id="profile-source" target="_blank" rel="noreferrer">Read the profile’s source documentation ↗</a><p id="profile-version" class="small muted"></p></div></section>
      <footer class="workspace-footer"><span class="small muted">No account. No API key. No upload.</span><div class="export-actions"><label class="checkbox-label"><input id="include-content" type="checkbox" /> Include rule content</label><button id="export-button" class="text-button">Export JSON <span aria-hidden="true">↓</span></button></div></footer>
      <section class="local-callout"><div><span class="eyebrow">TAKE IT TO YOUR REPO</span><h2>Find your hidden instructions.</h2><p>Run Rulemap locally and open the same map for your project.</p></div><button id="copy-command" class="button primary-button">Copy local command <span aria-hidden="true">↗</span></button><details><summary>View install command</summary><code id="install-command"></code></details></section>
    </main>
  </div>`;

/** Announce a result or an actionable error without interpreting markup. */
function announce(message: string, error = false): void {
  const notice = element('notice');
  notice.textContent = message;
  notice.classList.toggle('error', error);
  notice.hidden = !message;
}

/** Create profile options using the resolver’s authoritative profile names. */
function populateProfiles(): void {
  for (const id of ['profile', 'compare-profile']) {
    const select = element<HTMLSelectElement>(id);
    for (const key of PROFILE_KEYS) {
      const option = node('option', '', PROFILES[key].name);
      option.value = key;
      select.append(option);
    }
  }
  element<HTMLSelectElement>('profile').value = profile;
  element<HTMLSelectElement>('compare-profile').value = compareProfile;
}

/** Keep controls in sync after loading a demo, folder, or local snapshot. */
function syncControls(): void {
  element<HTMLInputElement>('target').value = target;
  element<HTMLInputElement>('cwd').value = cwd || '.';
  element<HTMLSelectElement>('profile').value = profile;
  element('source-name').textContent = sourceName;
  element('workspace-kind').textContent = activeDemo ? 'DEMO' : 'LOCAL';
}

/** Draw the curated, independently selectable repository scenarios. */
function renderPresets(): void {
  const container = element('presets');
  container.replaceChildren();
  DEMOS.forEach((demo, index) => {
    const button = node('button', `preset${activeDemo === demo.id ? ' active' : ''}`);
    button.setAttribute('aria-pressed', String(activeDemo === demo.id));
    button.append(node('span', 'preset-number', `0${index + 1}`), node('span', '', demo.title), node('span', 'preset-arrow', '↗'));
    button.title = demo.description;
    button.addEventListener('click', () => loadDemo(demo.id));
    container.append(button);
  });
}

/** Replace the workspace with a complete sample, discarding in-memory edits. */
function loadDemo(id: string): void {
  const demo = DEMOS.find((candidate) => candidate.id === id);
  if (!demo) return;
  files = demo.files.map(copyFile);
  originalFiles = demo.files.map(copyFile);
  activeDemo = id;
  sourceName = 'Example repository';
  target = demo.file;
  cwd = demo.cwd;
  selectedPath = files[0]?.path ?? '';
  snapshotDiagnostics = [];
  profile = demo.id.includes('glob') ? 'cursor' : 'codex';
  element('source-note').textContent = demo.description;
  announce('');
  syncControls();
  render();
}

/** Draw repository paths with their current profile status. */
function renderFileList(): void {
  const list = element('file-list');
  list.replaceChildren();
  element('file-count').textContent = String(files.length);
  for (const file of files) {
    const rule = currentInspection.rules.find((candidate) => candidate.path === file.path);
    const button = node('button', `file-button${file.path === selectedPath ? ' selected' : ''}`);
    button.title = file.path;
    button.setAttribute('aria-pressed', String(file.path === selectedPath));
    const name = node('span', 'file-name', file.path);
    button.append(node('span', `file-dot ${rule?.status ?? 'inactive'}`), name);
    button.addEventListener('click', () => { selectedPath = file.path; renderFileList(); renderEditor(); });
    list.append(button);
  }
  if (!files.length) list.append(node('p', 'small muted', 'No instruction files found. Open a folder with AGENTS.md, CLAUDE.md, Cursor or Copilot rules.'));
}

/** Present a resolver result using plain text, including its exact explanation. */
function ruleCard(rule: RuleResult, compact = false): HTMLElement {
  const card = node('article', `rule-card ${rule.status}${compact ? ' compact' : ''}`);
  const heading = node('div', 'rule-heading');
  const identity = node('div', 'rule-identity');
  identity.append(node('span', 'rule-symbol', rule.status === 'included' ? '✓' : rule.status === 'excluded' ? '−' : '?'), node('h3', '', rule.path));
  const badge = node('span', `status-badge ${rule.status}`, rule.status);
  heading.append(identity, badge);
  card.append(heading, node('p', 'rule-reason', rule.reason));
  const foot = node('div', 'rule-foot');
  foot.append(node('span', '', `${rule.startLine}–${rule.endLine} lines · ${rule.bytes.toLocaleString()} bytes${rule.order !== undefined ? ` · order ${rule.order}` : ''}`));
  if (rule.importedFrom) foot.append(node('span', 'imported-from', `from ${rule.importedFrom}`));
  if (!compact) {
    const button = node('button', 'text-button', 'View source ↗');
    button.setAttribute('aria-label', `View source ${rule.path}`);
    button.addEventListener('click', () => {
      selectedPath = rule.path;
      renderFileList();
      renderEditor();
      element<HTMLTextAreaElement>('editor').focus({ preventScroll: true });
      if (window.innerWidth < 1000) element('editor-panel-placeholder').scrollIntoView();
    });
    foot.append(button);
  }
  card.append(foot);
  return card;
}

/** Render aggregate counts and each resolved rule without hiding exclusions. */
function renderRules(): void {
  const list = element('rule-list');
  list.replaceChildren();
  const legend = element('legend');
  legend.replaceChildren();
  for (const status of ['included', 'excluded', 'conditional'] as const) {
    const count = currentInspection.rules.filter((rule) => rule.status === status).length;
    const item = node('span', `legend-item ${status}`);
    item.append(node('span', 'file-dot'), node('strong', '', String(count)), document.createTextNode(status));
    legend.append(item);
  }
  element('bytes').textContent = `${currentInspection.totalBytes.toLocaleString()} bytes included`;
  element('result-subtitle').textContent = `${PROFILES[profile].name} · ${target || '(choose a target file)'}`;
  for (const rule of currentInspection.rules) list.append(ruleCard(rule));
  if (!currentInspection.rules.length) {
    const empty = node('div', 'empty-state');
    empty.append(node('span', 'empty-icon', '⌁'), node('h3', '', 'No matching instruction files'), node('p', '', 'Choose a different agent profile, try a sample, or open a repository with instruction files.'));
    list.append(empty);
  }
  const diagnostics = element('diagnostics');
  diagnostics.replaceChildren();
  for (const diagnostic of [...snapshotDiagnostics, ...currentInspection.diagnostics]) {
    diagnostics.append(node('p', `diagnostic ${diagnostic.severity}`, `${diagnostic.path ? `${diagnostic.path}: ` : ''}${diagnostic.message}`));
  }
}

/** Display the selected instruction source in an editable, inert textarea. */
function renderEditor(): void {
  const file = files.find((candidate) => candidate.path === selectedPath);
  element('editor-path').textContent = file?.path ?? 'Select an instruction file';
  const editor = element<HTMLTextAreaElement>('editor');
  editor.disabled = !file;
  if (editor.value !== (file?.content ?? '')) editor.value = file?.content ?? '';
  element('editor-meta').textContent = file ? `${file.content.split('\n').length} lines · Markdown` : 'No source selected';
  const original = originalFiles.find((candidate) => candidate.path === selectedPath);
  element('edited-badge').hidden = file?.content === original?.content;
  element<HTMLButtonElement>('reset-button').disabled = !files.some((candidate, index) => candidate.content !== originalFiles[index]?.content);
}

/** Compare both profiles independently with the identical repository input. */
function renderComparison(): void {
  const container = element('comparison');
  container.replaceChildren();
  for (const key of [profile, compareProfile]) {
    const result = key === profile ? currentInspection : inspect(files, { file: target, profile: key, cwd });
    const column = node('div', 'comparison-column');
    const heading = node('div', 'comparison-heading');
    heading.append(node('h3', '', PROFILES[key].name), node('span', 'count-label', `${result.rules.filter((rule) => rule.status === 'included').length} included`));
    column.append(heading, node('p', 'small muted comparison-description', PROFILES[key].description));
    for (const rule of result.rules) column.append(ruleCard(rule, true));
    if (!result.rules.length) column.append(node('p', 'empty-state', 'No instruction files for this profile.'));
    for (const diagnostic of result.diagnostics) column.append(node('p', `diagnostic ${diagnostic.severity}`, diagnostic.message));
    container.append(column);
  }
}

/** Resolve the current workspace and redraw all dependent panels. */
function render(): void {
  try {
    currentInspection = inspect(files, { file: target, profile, cwd });
    renderPresets();
    renderFileList();
    renderRules();
    renderEditor();
    if (mode === 'compare') renderComparison();
    const assumptions = element('assumptions-list');
    assumptions.replaceChildren(...currentInspection.assumptions.map((text) => node('li', '', text)));
    const source = element<HTMLAnchorElement>('profile-source');
    source.href = PROFILES[profile].source;
    element('profile-version').textContent = `Profile: ${currentInspection.profileVersion}. Check the source documentation for current behavior.`;
  } catch (error) {
    announce(`Could not inspect this input: ${error instanceof Error ? error.message : String(error)}. Check the target and launch directory.`, true);
  }
}

/** Switch accessible tab state and keep both views on the same inputs. */
function setMode(next: 'map' | 'compare'): void {
  mode = next;
  for (const key of ['map', 'compare'] as const) {
    const active = mode === key;
    const tab = element<HTMLButtonElement>(`${key}-tab`);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    element(`${key}-panel`).hidden = !active;
  }
  if (next === 'compare') renderComparison();
}

/** Export the visible result, omitting source text unless explicitly requested. */
function exportReport(): void {
  const include = element<HTMLInputElement>('include-content').checked;
  const inspections = mode === 'compare' ? [currentInspection, inspect(files, { file: target, profile: compareProfile, cwd })] : [currentInspection];
  const report = {
    tool: 'rulemap',
    contentIncluded: include,
    inspections: inspections.map((inspection) => ({
      ...inspection,
      rules: inspection.rules.map((rule) => {
        const { content, ...metadata } = rule;
        return include ? { ...metadata, content } : metadata;
      }),
    })),
  };
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(report, null, 2)}\n`], { type: 'application/json' }));
  const link = node('a');
  link.href = url;
  link.download = 'rulemap-report.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce(include ? 'Report downloaded with rule content. Review it before sharing.' : 'Report downloaded. Rule content is omitted; repository paths and diagnostics remain.');
}

/** Load a folder with only instruction files and their local Markdown imports. */
async function openFolder(): Promise<void> {
  const input = element<HTMLInputElement>('folder-input');
  if (!input.files?.length) return;
  const button = element<HTMLButtonElement>('import-button');
  button.disabled = true;
  announce('Reading instruction files locally…');
  try {
    const imported = await importDirectory(Array.from(input.files));
    files = imported.files;
    originalFiles = files.map(copyFile);
    sourceName = imported.name;
    activeDemo = '';
    selectedPath = files[0]?.path ?? '';
    target = imported.target;
    cwd = '.';
    snapshotDiagnostics = [];
    element('source-note').textContent = 'Browser snapshot. Reopen the folder to refresh files from disk.';
    syncControls();
    render();
    announce(imported.messages.length ? imported.messages.join(' ') : `Opened ${files.length} instruction files locally. Choose your target file and agent profile.`);
  } catch (error) {
    announce(`Could not open this folder: ${error instanceof Error ? error.message : String(error)}. Try a smaller folder or run the local CLI.`, true);
  } finally {
    button.disabled = false;
    input.value = '';
  }
}

/** Load the authenticated startup snapshot only when launched by the local CLI. */
async function loadLocalSnapshot(): Promise<void> {
  const token = new URLSearchParams(location.search).get('token');
  if (!token) return;
  try {
    const response = await fetch(`./api/snapshot?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`server returned ${response.status}`);
    const data = await response.json() as { files: RepoFile[]; file: string; cwd: string; profile: Profile; diagnostics?: Diagnostic[] };
    if (!Array.isArray(data.files) || !PROFILE_KEYS.includes(data.profile) || typeof data.file !== 'string' || typeof data.cwd !== 'string' || data.files.some((file) => typeof file.path !== 'string' || typeof file.content !== 'string')) throw new Error('invalid snapshot');
    files = data.files.map(copyFile);
    originalFiles = data.files.map(copyFile);
    target = data.file;
    cwd = data.cwd;
    profile = data.profile;
    snapshotDiagnostics = data.diagnostics ?? [];
    sourceName = 'Your local repository';
    activeDemo = '';
    selectedPath = files[0]?.path ?? '';
    element('source-note').textContent = 'Snapshot taken when the command started. Restart the CLI to refresh files from disk.';
    syncControls();
    render();
    announce('Local repository loaded. Edits here stay in memory.');
  } catch (error) {
    announce(`Could not load the local snapshot (${error instanceof Error ? error.message : String(error)}). Restart the CLI and open its new URL. Showing an example repository.`, true);
  }
}

populateProfiles();
syncControls();
render();
element('install-command').textContent = INSTALL;
element('source-note').textContent = initialDemo.description;
element('editor').closest('aside')!.id = 'editor-panel-placeholder';
element<HTMLInputElement>('target').addEventListener('input', (event) => { target = (event.target as HTMLInputElement).value; render(); });
element<HTMLInputElement>('cwd').addEventListener('input', (event) => { cwd = (event.target as HTMLInputElement).value; render(); });
element<HTMLSelectElement>('profile').addEventListener('change', (event) => { profile = (event.target as HTMLSelectElement).value as Profile; render(); });
element<HTMLSelectElement>('compare-profile').addEventListener('change', (event) => { compareProfile = (event.target as HTMLSelectElement).value as Profile; renderComparison(); });
element<HTMLTextAreaElement>('editor').addEventListener('input', (event) => {
  const file = files.find((candidate) => candidate.path === selectedPath);
  if (file) file.content = (event.target as HTMLTextAreaElement).value;
  render();
});
element('reset-button').addEventListener('click', () => { files = originalFiles.map(copyFile); render(); announce('Instruction edits reset to the loaded snapshot.'); });
element('map-tab').addEventListener('click', () => setMode('map'));
element('compare-tab').addEventListener('click', () => setMode('compare'));
for (const key of ['map', 'compare'] as const) {
  element(`${key}-tab`).addEventListener('keydown', (event) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 'map' : event.key === 'End' ? 'compare' : mode === 'map' ? 'compare' : 'map';
      setMode(next);
      element(`${next}-tab`).focus();
    }
  });
}
element('assumptions-toggle').addEventListener('click', () => {
  const content = element('assumptions-content');
  content.hidden = !content.hidden;
  element('assumptions-toggle').setAttribute('aria-expanded', String(!content.hidden));
});
element('export-button').addEventListener('click', exportReport);
element('import-button').addEventListener('click', () => element<HTMLInputElement>('folder-input').click());
element('folder-input').addEventListener('change', () => { void openFolder(); });
element('copy-command').addEventListener('click', () => {
  void navigator.clipboard.writeText(INSTALL).then(() => {
    element('copy-command').textContent = 'Copied ✓';
    announce('Command copied. Run it from the repository you want to inspect, and change --file to your target file.');
  }).catch(() => { announce('Clipboard access is unavailable. Expand “View install command” below and copy the command.'); });
});
void loadLocalSnapshot();
