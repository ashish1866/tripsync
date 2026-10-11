// Writes server/package-lock.json, the lockfile Render installs from.
//
// Why a second lockfile: on this PC, client and server share the root
// package-lock.json (npm workspaces). Render only sees the server folder
// (rootDir: server), so it needs a lockfile inside that folder.
//
// Run after changing a server dependency:   npm run lock:server
// Render's build runs `npm ci`, which fails loudly if this file is out of date.
import { execSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'server');
const work = mkdtempSync(path.join(tmpdir(), 'tripsync-lock-'));

try {
  // Outside the workspace, npm treats server/package.json as a standalone project.
  copyFileSync(path.join(serverDir, 'package.json'), path.join(work, 'package.json'));
  execSync('npm install --package-lock-only --ignore-scripts --no-audit --no-fund', { cwd: work, stdio: 'inherit', shell: true });
  copyFileSync(path.join(work, 'package-lock.json'), path.join(serverDir, 'package-lock.json'));
  console.log('Wrote server/package-lock.json');
} finally {
  rmSync(work, { recursive: true, force: true });
}
