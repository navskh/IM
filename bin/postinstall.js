#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const isWindows = process.platform === 'win32';

// Wire installed node_modules into the Next.js standalone bundle.
// We strip .next/standalone/node_modules from the published tarball (it makes
// npm publish fail with 502 due to the bundled native binaries — sharp etc.),
// so the standalone server has nowhere to resolve its deps from. After install,
// npm has placed our deps in <root>/node_modules; symlink that into the
// standalone tree so server.js works unchanged.
try {
  const root = path.resolve(__dirname, '..');
  const standaloneNm = path.join(root, '.next', 'standalone', 'node_modules');
  const realNm = path.join(root, 'node_modules');

  if (fs.existsSync(realNm) && !fs.existsSync(standaloneNm)) {
    try {
      fs.symlinkSync(realNm, standaloneNm, isWindows ? 'junction' : 'dir');
    } catch {
      // Symlink can fail on Windows without admin or on restrictive FS — fall
      // back to a recursive copy so the bundle still resolves modules.
      fs.cpSync(realNm, standaloneNm, { recursive: true });
    }
  }
} catch { /* best-effort; bin entry still informs the user below */ }

try {
  // Check if `im` is on PATH. Windows uses `where`, POSIX uses `command -v`.
  execSync(isWindows ? 'where im' : 'command -v im', { stdio: 'ignore', shell: true });
} catch {
  let npmPrefix = '';
  try {
    npmPrefix = execSync('npm prefix -g', { encoding: 'utf-8' }).trim();
  } catch { /* fall through */ }

  console.log('\n  \u2713 idea-manager installed!\n');
  console.log('  \u26A0  "im" command not found in PATH.\n');

  if (isWindows) {
    // On Windows, npm global prefix is the directory holding the .cmd wrappers (no "bin" subdir).
    const dir = npmPrefix || '%APPDATA%\\npm';
    console.log(`  Add this directory to your PATH:\n`);
    console.log(`    ${dir}\n`);
    console.log('  PowerShell (User PATH):');
    console.log(`    [Environment]::SetEnvironmentVariable('Path', "$env:Path;${dir}", 'User')\n`);
    console.log('  Or via System Properties > Environment Variables.');
    console.log('  Open a new terminal and run: im start\n');
  } else {
    const binDir = npmPrefix ? path.join(npmPrefix, 'bin') : '$(npm prefix -g)/bin';
    console.log('  Add to your shell profile (~/.zshrc or ~/.bashrc):\n');
    console.log(`    export PATH="${binDir}:$PATH"\n`);
    console.log('  Then open a new terminal and run: im start\n');
  }
}
