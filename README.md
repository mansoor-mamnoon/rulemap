<p align="center">
  <img src="public/favicon.svg" width="80" height="80" alt="Rulemap" />
</p>

<h1 align="center">Rulemap</h1>

<p align="center">
  <strong>See which instructions your coding agent loads, and why.</strong><br>
  A local visual debugger for <code>AGENTS.md</code>, <code>CLAUDE.md</code>, Cursor rules, and GitHub Copilot instructions.
</p>

<p align="center">
  <a href="https://mansoor-mamnoon.github.io/rulemap/">Try the live demo</a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#quickstart">Quickstart</a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#why">Why?</a>
</p>

---

## The problem

You write an `AGENTS.md` with testing rules. You add a `.claude/rules/security.md` with path-scoped validation. You drop a `.cursor/rules/release.mdc` for changelog checks.

Then your agent ignores half of them.

Each coding agent (Codex, Claude Code, Cursor, Copilot) discovers instructions differently. Some walk the directory tree. Some check frontmatter globs. Some pick one file per directory and skip the rest. The rules are documented — but scattered across four different docs, and nobody reads all four before debugging a bad agent response.

**Rulemap shows you exactly which instructions apply to a given file, for a given agent, and explains why each one is included, excluded, or conditional.**

## Quickstart

```bash
# Inspect your repo for a specific file
npx rulemap inspect . --file src/auth.ts --web

# Compare what Codex vs Claude sees
npx rulemap compare . --file src/auth.ts --profiles codex,claude

# See all available agent profiles
npx rulemap profiles
```

No API key. No account. No telemetry. No file upload. Everything runs locally.

## What it does

Pick a file in your repository and an agent profile. Rulemap scans your instruction files and tells you:

| Status | Meaning |
|--------|---------|
| **Included** | This instruction loads for the selected file |
| **Excluded** | This instruction exists but won't load — with the specific reason |
| **Conditional** | Loading depends on runtime context (agent-requested rules, path matching, etc.) |

For every instruction file, you get:
- The exact reason it's included or excluded
- Its byte size (relevant for Codex's 32KB budget)
- Its load order
- Import chain tracking (Claude's `@import` system)
- Frontmatter validation warnings

## Supported agents

| Profile | What it models |
|---------|----------------|
| **Codex** | `AGENTS.md` / `AGENTS.override.md` discovery, directory chain, byte budget |
| **Claude Code** | `CLAUDE.md` memories, `.claude/rules/` with path scoping, `@import` expansion, AGENTS fallback |
| **Cursor** | `.cursor/rules/*.mdc` with `alwaysApply`, `globs`, `description` routing, plus `AGENTS.md` |
| **Copilot** | `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md` with `applyTo` |

Profiles are based on each agent's public documentation as of October 2026. They model documented repository rules, not observed model behavior.

## CLI reference

```
rulemap inspect [root] --file <path>     Show the instruction map
rulemap explain [root] --file <path>     Same as inspect (alias)
rulemap compare [root] --file <path>     Side-by-side two profiles
rulemap demo [--web] [--example <id>]    Run a built-in example
rulemap profiles                         List supported profiles
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--profile <name>` | `codex` | Agent profile to use |
| `--format <fmt>` | `text` | Output: `text`, `json`, `markdown`, `html` |
| `--web` | — | Open an interactive local viewer in your browser |
| `--output <path>` | — | Save the report to a file |
| `--include-content` | `false` | Include instruction text in exports |
| `--profiles <a,b>` | `codex,claude` | Profiles for `compare` |
| `--cwd <path>` | `.` | Agent launch directory (affects Codex discovery) |
| `--max-bytes <n>` | `32768` | Codex instruction byte budget |
| `--fail-on-warnings` | — | Exit code 2 on scan warnings |

### JSON output

```bash
rulemap inspect . --file src/auth.ts --format json | jq '.rules[] | select(.status == "included") | .path'
```

The JSON schema is stable at `schemaVersion: 1`. Every rule includes `path`, `status`, `reason`, `bytes`, `startLine`, `endLine`, and optional `order` and `importedFrom`.

## Web viewer

```bash
npx rulemap inspect . --file src/auth.ts --web
```

Opens a local-only viewer at `127.0.0.1` with:
- Interactive instruction map with real-time editing
- Agent comparison view
- File browser with status indicators
- Built-in demo scenarios
- JSON export (content redacted by default)
- Folder import from the browser (files never leave your device)

The viewer is also deployed at [mansoor-mamnoon.github.io/rulemap](https://mansoor-mamnoon.github.io/rulemap/) with demo repositories for quick exploration.

## Programmatic API

```typescript
import { inspect } from 'rulemap';
import type { Inspection, RepoFile } from 'rulemap';

const files: RepoFile[] = [
  { path: 'AGENTS.md', content: '# Rules\nRun tests before finishing.' },
  { path: 'src/auth.ts', content: 'export const auth = true;' },
];

const result: Inspection = inspect(files, {
  file: 'src/auth.ts',
  profile: 'codex',
});

for (const rule of result.rules) {
  console.log(`${rule.status}: ${rule.path} — ${rule.reason}`);
}
```

## Built-in demos

```bash
npx rulemap demo --web                    # The hidden override
npx rulemap demo --example glob-mismatch  # The glob that misses
npx rulemap demo --example agent-switch   # Same repo, different context
```

Each demo is a minimal synthetic repository that shows a real instruction surprise:
- **The hidden override**: An `AGENTS.override.md` silently replaces your testing instructions
- **The glob that misses**: A `src/*.ts` glob doesn't reach `src/api/auth.ts`
- **Same repo, different context**: Four agents see completely different rules from the same files

## Privacy

Rulemap is read-only and local by design:

- No API keys, accounts, or telemetry
- No network requests (the CLI never calls home)
- The local viewer binds to `127.0.0.1` with a random token
- Content is redacted from exports by default
- Symlinks outside the repository are refused
- The browser demo reads your folder in-page; files never leave your device

## Contributing

Issues and PRs are welcome. If you're adding a new agent profile, include:
1. A link to the agent's public documentation
2. The documented discovery rules
3. At least one demo scenario that highlights a non-obvious behavior
4. Tests covering the resolution logic

## License

MIT
