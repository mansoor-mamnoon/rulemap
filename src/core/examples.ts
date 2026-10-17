import type { Demo } from './types.js';

/** Small synthetic repositories illustrating reproducible instruction surprises. */
export const DEMOS: Demo[] = [
  {
    id: 'override-surprise', title: 'The hidden override',
    description: 'A local override replaces the testing instructions you expected Codex to read.',
    file: 'src/auth.ts', cwd: 'src', files: [
      { path: 'AGENTS.md', content: '# Project\nUse TypeScript. Keep changes small.\n' },
      { path: 'src/AGENTS.md', content: '# Application\nRun npm test before finishing.\nNever log authentication tokens.\n' },
      { path: 'src/AGENTS.override.md', content: '# Temporary experiment\nRun npm run test:auth for authentication changes.\n' },
      { path: 'src/auth.ts', content: 'export function isAuthenticated(token: string) {\n  return token.length > 0;\n}\n' },
      { path: 'docs/AGENTS.md', content: 'Use short sentences in documentation.\n' },
    ],
  },
  {
    id: 'glob-mismatch', title: 'The glob that misses',
    description: 'A rule for src/*.ts does not reach src/api/auth.ts. Compare the recursive pattern.',
    file: 'src/api/auth.ts', cwd: '', files: [
      { path: 'AGENTS.md', content: 'Keep the public API stable.\n' },
      { path: '.cursor/rules/security.mdc', content: '---\nglobs: "src/*.ts"\nalwaysApply: false\n---\nValidate all authentication inputs.\n' },
      { path: '.cursor/rules/tests.mdc', content: '---\nglobs: "src/**/*.ts"\nalwaysApply: false\n---\nAdd regression tests for changed behavior.\n' },
      { path: '.cursor/rules/release.mdc', content: '---\ndescription: Release checklist\nalwaysApply: false\n---\nUpdate the changelog before a release.\n' },
      { path: 'src/api/auth.ts', content: 'export const auth = { required: true };\n' },
    ],
  },
  {
    id: 'agent-switch', title: 'Same repo, different context',
    description: 'Switch agents to see different file discovery, imports, and scoped instructions.',
    file: 'src/auth.ts', cwd: '', files: [
      { path: 'AGENTS.md', content: '# Shared\nRun npm test.\n' },
      { path: 'CLAUDE.md', content: '# Claude\n@docs/testing.md\nExplain security tradeoffs.\n' },
      { path: 'docs/testing.md', content: '# Test guide\nUse deterministic fixtures for authentication tests.\n' },
      { path: 'src/CLAUDE.md', content: 'Check authorization at every entry point.\n' },
      { path: '.claude/rules/security.md', content: '---\npaths:\n  - "src/**/*.ts"\n---\nValidate user inputs at the boundary.\n' },
      { path: '.cursor/rules/project.mdc', content: '---\nalwaysApply: true\n---\nKeep components small.\n' },
      { path: '.github/copilot-instructions.md', content: 'Describe how each change was tested.\n' },
      { path: '.github/instructions/typescript.instructions.md', content: '---\napplyTo: "**/*.ts"\n---\nAvoid the any type.\n' },
      { path: 'src/auth.ts', content: 'export const authenticated = false;\n' },
    ],
  },
];
