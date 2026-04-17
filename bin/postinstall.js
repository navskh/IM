#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

const isWindows = process.platform === 'win32';

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
