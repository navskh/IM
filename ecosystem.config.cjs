module.exports = {
  apps: [{
    name: 'idea-manager',
    script: 'npm',
    args: 'start -- -p 3456',
    cwd: '/Users/young/Toy/idea-manager',
    env: {
      NODE_ENV: 'production',
      FORCE_COLOR: '0',
    },
    // Explicitly unset Claude Code session vars
    filter_env: ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_MAX_OUTPUT_TOKENS', 'ANTHROPIC_PARENT_SESSION'],
  }],
};
