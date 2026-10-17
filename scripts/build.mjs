import { build } from 'esbuild';
import { build as buildWeb } from 'vite';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
const cjsBanner = '#!/usr/bin/env node\nimport { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);';
await build({ entryPoints: ['src/cli.ts'], outfile: 'dist/cli.js', bundle: true, platform: 'node', format: 'esm', target: 'node22', banner: { js: cjsBanner } });
await build({ entryPoints: ['src/core/index.ts'], outfile: 'dist/index.js', bundle: true, platform: 'neutral', format: 'esm', target: 'es2022' });
chmodSync('dist/cli.js', 0o755);
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--emitDeclarationOnly'], { stdio: 'inherit' });
await buildWeb();
