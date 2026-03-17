#!/usr/bin/env node

const { execSync } = require('child_process');

try {
  execSync('im --version', { stdio: 'ignore' });
} catch {
  const npmBin = execSync('npm prefix -g', { encoding: 'utf-8' }).trim() + '/bin';

  console.log('\n  ✓ idea-manager installed!\n');
  console.log('  ⚠ "im" command not found in PATH.');
  console.log(`  Add this to your shell profile (~/.zshrc or ~/.bashrc):\n`);
  console.log(`    export PATH="${npmBin}:$PATH"\n`);
  console.log('  Then run: source ~/.zshrc\n');
}
