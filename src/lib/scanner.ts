import fs from 'fs';
import path from 'path';

const MAX_FILE_SIZE = 200_000; // 200KB per file — 개별 파일 크기 제한만 유지

const SOURCE_SUMMARY_THRESHOLD = 10_000; // 10KB — summarize source files larger than this

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '__pycache__',
  '.cache', '.tmp', 'coverage', '.turbo', '.vercel', '.output',
  'vendor', 'target', '.gradle', '.idea', '.vscode', '.svn',
  '.hg', 'out', '.parcel-cache', '.nuxt', '.svelte-kit',
]);

// Priority 0: Root project config files
const PRIORITY_FILES = new Set([
  'README.md', 'CLAUDE.md', '.cursorrules',
  'package.json', 'tsconfig.json', 'Cargo.toml', 'go.mod',
  'pyproject.toml', 'requirements.txt', 'pom.xml', 'build.gradle',
  'Makefile', 'docker-compose.yml', 'Dockerfile',
  'docker-compose.yaml', '.env.example', 'turbo.json',
  'nx.json', 'workspace.json', 'lerna.json',
]);

// Entry point file stems
const ENTRY_POINT_PATTERNS = [
  'index', 'main', 'app', 'server', 'mod', 'lib',
];

// Route/component path segments (Priority 2)
const ROUTE_COMPONENT_SEGMENTS = new Set([
  'routes', 'pages', 'app', 'components', 'controllers',
  'services', 'hooks', 'middleware', 'handlers', 'api',
  'views', 'modules', 'features', 'stores', 'utils',
  'helpers', 'providers', 'contexts', 'layouts',
]);

const DOC_EXTENSIONS = new Set([
  '.md', '.txt', '.rst', '.adoc',
]);

const CONFIG_EXTENSIONS = new Set([
  '.json', '.toml', '.yaml', '.yml', '.xml',
  '.cfg', '.ini', '.env.example', '.properties',
]);

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.java', '.go', '.rs', '.rb', '.php',
  '.swift', '.kt', '.scala', '.cs', '.cpp', '.c', '.h',
  '.vue', '.svelte', '.astro',
  '.css', '.scss', '.less',
  '.sql', '.graphql', '.gql', '.prisma',
  '.sh', '.bash', '.zsh',
]);

// Extensions eligible for source summary extraction
const SUMMARIZABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.java', '.go', '.rs', '.rb', '.php',
  '.swift', '.kt', '.scala', '.cs', '.cpp', '.c', '.h',
]);

export interface ScannedFile {
  file_path: string;
  content: string;
}

// ============================================================
// Source summary extraction — compress large source files
// ============================================================

/**
 * Extract structural summary from source code:
 * - Keep: imports, exports, interface/type/enum blocks, function/class signatures, decorators
 * - Remove: function bodies (replaced with summary marker)
 */
export function extractSourceSummary(content: string, filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUMMARIZABLE_EXTENSIONS.has(ext)) return content;

  const lines = content.split('\n');
  const result: string[] = [];
  let braceDepth = 0;
  let inFunctionBody = false;
  let functionStartDepth = 0;
  let lastSignatureLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    // Always keep: empty lines at top level, imports, exports (re-exports), decorators, comments at top level
    if (braceDepth === 0 && !inFunctionBody) {
      // Import/export statements
      if (/^(import |export \{|export \*|export type |export default |from )/.test(trimmed)) {
        result.push(line);
        continue;
      }

      // Decorators
      if (trimmed.startsWith('@')) {
        result.push(line);
        continue;
      }

      // Interface, type alias, enum — keep entire block
      if (/^(export\s+)?(interface|type|enum)\s/.test(trimmed)) {
        result.push(line);
        // If block opens on this line, collect entire block
        if (trimmed.includes('{')) {
          let blockDepth = 0;
          for (let j = i; j < lines.length; j++) {
            const bLine = lines[j];
            if (j > i) result.push(bLine);
            for (const ch of bLine) {
              if (ch === '{') blockDepth++;
              if (ch === '}') blockDepth--;
            }
            if (blockDepth <= 0 && j > i) {
              i = j;
              break;
            }
            if (j === lines.length - 1) i = j;
          }
        }
        continue;
      }

      // Function/class/method signature detection
      const isFunctionLike = /^(export\s+)?(export\s+default\s+)?(async\s+)?(function\s+|const\s+\w+\s*=\s*(async\s*)?\(|const\s+\w+\s*=\s*(async\s*)?(\w+|\([^)]*\))\s*=>|class\s+|function\*?\s+)/.test(trimmed);
      const isArrowOrMethod = /^(export\s+)?(const|let|var)\s+\w+\s*[:=]/.test(trimmed) && (trimmed.includes('=>') || trimmed.includes('function'));

      if (isFunctionLike || isArrowOrMethod) {
        result.push(line);
        lastSignatureLine = result.length - 1;

        // Check if body opens on this line
        if (trimmed.includes('{')) {
          let openCount = 0;
          for (const ch of line) {
            if (ch === '{') openCount++;
            if (ch === '}') openCount--;
          }
          if (openCount > 0) {
            inFunctionBody = true;
            functionStartDepth = openCount;
            braceDepth = openCount;
            // Replace rest with summary marker
            result[lastSignatureLine] = line.substring(0, line.indexOf('{') + 1) + ' /* ... */ }';
            inFunctionBody = false;
            braceDepth = 0;

            // Skip to matching close brace
            let depth = openCount;
            for (let j = i + 1; j < lines.length; j++) {
              for (const ch of lines[j]) {
                if (ch === '{') depth++;
                if (ch === '}') depth--;
              }
              if (depth <= 0) {
                i = j;
                break;
              }
              if (j === lines.length - 1) i = j;
            }
          }
        }
        continue;
      }

      // Top-level variable declarations (keep)
      if (/^(export\s+)?(const|let|var)\s+/.test(trimmed)) {
        result.push(line);
        // If it spans multiple lines with opening brace/bracket, skip body
        if ((trimmed.includes('{') || trimmed.includes('[')) && !trimmed.includes(';')) {
          let depth = 0;
          for (const ch of line) {
            if (ch === '{' || ch === '[') depth++;
            if (ch === '}' || ch === ']') depth--;
          }
          if (depth > 0) {
            // Multi-line — skip to close
            for (let j = i + 1; j < lines.length; j++) {
              for (const ch of lines[j]) {
                if (ch === '{' || ch === '[') depth++;
                if (ch === '}' || ch === ']') depth--;
              }
              if (depth <= 0) {
                result.push(lines[j]);
                i = j;
                break;
              }
              if (j === lines.length - 1) i = j;
            }
          }
        }
        continue;
      }

      // Single-line comments at top level (keep for context)
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        result.push(line);
        continue;
      }

      // Empty lines (keep some for readability)
      if (trimmed === '') {
        // Only keep if previous line wasn't also empty
        if (result.length === 0 || result[result.length - 1].trim() !== '') {
          result.push(line);
        }
        continue;
      }

      // Anything else at top level — keep
      result.push(line);
      continue;
    }

    // Inside a function body — skip (already handled by forward-scanning above)
    // This handles edge cases where brace counting doesn't align
    if (inFunctionBody) {
      for (const ch of line) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
      }
      if (braceDepth <= 0) {
        inFunctionBody = false;
        braceDepth = 0;
      }
    }
  }

  return result.join('\n');
}

// ============================================================
// Non-streaming version (for existing scan API)
// ============================================================
export function scanProjectDirectory(projectPath: string): ScannedFile[] {
  if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
    throw new Error(`경로를 찾을 수 없습니다: ${projectPath}`);
  }

  const seen = new Set<string>();
  const results: ScannedFile[] = [];
  let totalSize = 0;

  const addFile = (relativePath: string, content: string): boolean => {
    if (seen.has(relativePath)) return false;
    seen.add(relativePath);
    results.push({ file_path: relativePath, content });
    totalSize += content.length;
    return true;
  };

  // Phase 1: Directory tree (compact overview)
  const tree = buildDirectoryTree(projectPath);
  addFile('__directory_tree.txt', tree);

  // Phase 2: Walk and collect files by priority
  const allFiles = collectAllFiles(projectPath);

  allFiles.sort((a, b) => filePriority(a.relativePath) - filePriority(b.relativePath));

  for (const file of allFiles) {
    const content = readFileSafe(file.absolutePath);
    if (!content) continue;

    const category = getFileCategory(file.relativePath);
    let finalContent = file.relativePath.endsWith('package.json')
      ? extractPackageJsonSummary(content)
      : content;

    // Apply source summary for large source files
    if (category === 'source' && finalContent.length > SOURCE_SUMMARY_THRESHOLD) {
      finalContent = extractSourceSummary(finalContent, file.relativePath);
    }

    addFile(file.relativePath, finalContent);
  }

  return results;
}

// ============================================================
// SSE streaming version
// ============================================================
export function* scanProjectDirectoryStream(projectPath: string): Generator<{
  type: 'scanning_dir' | 'file_found' | 'done';
  dir?: string;
  file?: { file_path: string; size: number; category: string; folder: string; summarized: boolean };
  results?: ScannedFile[];
  total?: number;
  totalSize?: number;
  treeSize?: number;
}> {
  if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
    throw new Error(`경로를 찾을 수 없습니다: ${projectPath}`);
  }

  const seen = new Set<string>();
  const results: ScannedFile[] = [];
  let totalSize = 0;

  // Phase 1: Directory tree
  yield { type: 'scanning_dir', dir: '(디렉토리 구조 분석)' };
  const tree = buildDirectoryTree(projectPath);
  seen.add('__directory_tree.txt');
  results.push({ file_path: '__directory_tree.txt', content: tree });
  totalSize += tree.length;
  yield {
    type: 'file_found',
    file: { file_path: '__directory_tree.txt', size: tree.length, category: 'tree', folder: '(root)', summarized: false },
  };

  // Phase 2: Walk directories and collect files
  const allFiles = collectAllFilesWithDirs(projectPath);

  // Sort by priority (source-first)
  allFiles.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    if (a.type === 'file' && b.type === 'file') {
      return filePriority(a.relativePath) - filePriority(b.relativePath);
    }
    return 0;
  });

  let lastDir = '';

  for (const entry of allFiles) {
    if (entry.type === 'dir') {
      if (entry.relativePath !== lastDir) {
        lastDir = entry.relativePath;
        yield { type: 'scanning_dir', dir: entry.relativePath };
      }
      continue;
    }

    const content = readFileSafe(entry.absolutePath);
    if (!content) continue;

    const category = getFileCategory(entry.relativePath);
    let finalContent = entry.relativePath.endsWith('package.json')
      ? extractPackageJsonSummary(content)
      : content;

    let summarized = false;
    if (category === 'source' && finalContent.length > SOURCE_SUMMARY_THRESHOLD) {
      finalContent = extractSourceSummary(finalContent, entry.relativePath);
      summarized = true;
    }

    if (seen.has(entry.relativePath)) continue;

    seen.add(entry.relativePath);
    results.push({ file_path: entry.relativePath, content: finalContent });
    totalSize += finalContent.length;

    const folder = getFolder(entry.relativePath);

    yield {
      type: 'file_found',
      file: {
        file_path: entry.relativePath,
        size: finalContent.length,
        category,
        folder,
        summarized,
      },
    };
  }

  yield { type: 'done', results, total: results.length, totalSize, treeSize: tree.length };
}

// ============================================================
// Helpers
// ============================================================

interface FileEntry {
  type: 'file';
  relativePath: string;
  absolutePath: string;
}

interface DirEntry {
  type: 'dir';
  relativePath: string;
  absolutePath: string;
}

function collectAllFiles(basePath: string): FileEntry[] {
  const files: FileEntry[] = [];
  walkCollect(basePath, basePath, files);
  return files;
}

function collectAllFilesWithDirs(basePath: string): (FileEntry | DirEntry)[] {
  const entries: (FileEntry | DirEntry)[] = [];
  walkCollectWithDirs(basePath, basePath, entries);
  return entries;
}

function walkCollect(dirPath: string, basePath: string, files: FileEntry[]) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isFile() && isScannableFile(entry.name)) {
        files.push({
          type: 'file',
          relativePath: path.relative(basePath, fullPath),
          absolutePath: fullPath,
        });
      } else if (entry.isDirectory() && !shouldIgnoreDir(entry.name)) {
        walkCollect(fullPath, basePath, files);
      }
    }
  } catch {
    // ignore permission errors
  }
}

function walkCollectWithDirs(dirPath: string, basePath: string, entries: (FileEntry | DirEntry)[]) {
  try {
    const dirEntries = fs.readdirSync(dirPath, { withFileTypes: true });
    const relDir = path.relative(basePath, dirPath) || '.';
    entries.push({ type: 'dir', relativePath: relDir, absolutePath: dirPath });

    for (const entry of dirEntries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isFile() && isScannableFile(entry.name)) {
        entries.push({
          type: 'file',
          relativePath: path.relative(basePath, fullPath),
          absolutePath: fullPath,
        });
      } else if (entry.isDirectory() && !shouldIgnoreDir(entry.name)) {
        walkCollectWithDirs(fullPath, basePath, entries);
      }
    }
  } catch {
    // ignore
  }
}

function shouldIgnoreDir(name: string): boolean {
  return name.startsWith('.') || IGNORED_DIRS.has(name);
}

function isScannableFile(name: string): boolean {
  if (PRIORITY_FILES.has(name)) return true;
  const ext = path.extname(name).toLowerCase();
  return DOC_EXTENSIONS.has(ext) || CONFIG_EXTENSIONS.has(ext) || SOURCE_EXTENSIONS.has(ext);
}

function isRouteOrComponent(relativePath: string): boolean {
  const parts = relativePath.split('/');
  return parts.some(p => ROUTE_COMPONENT_SEGMENTS.has(p.toLowerCase()));
}

function filePriority(relativePath: string): number {
  const name = path.basename(relativePath);
  const ext = path.extname(name).toLowerCase();
  const stem = path.basename(name, ext).toLowerCase();

  // Priority 0: Top-level project files
  if (PRIORITY_FILES.has(name) && !relativePath.includes('/')) return 0;
  // Priority 1: Entry point source files
  if (SOURCE_EXTENSIONS.has(ext) && ENTRY_POINT_PATTERNS.includes(stem)) return 1;
  // Priority 2: Route/component source files
  if (SOURCE_EXTENSIONS.has(ext) && isRouteOrComponent(relativePath)) return 2;
  // Priority 3: Other source files
  if (SOURCE_EXTENSIONS.has(ext)) return 3;
  // Priority 4: Doc files
  if (DOC_EXTENSIONS.has(ext)) return 4;
  // Priority 5: Nested project config files
  if (PRIORITY_FILES.has(name)) return 5;
  // Priority 6: Other config files
  if (CONFIG_EXTENSIONS.has(ext)) return 6;
  return 7;
}

export function getFileCategory(relativePath: string): string {
  const name = path.basename(relativePath);
  const ext = path.extname(name).toLowerCase();
  if (SOURCE_EXTENSIONS.has(ext)) return 'source';
  if (DOC_EXTENSIONS.has(ext)) return 'doc';
  if (PRIORITY_FILES.has(name) || CONFIG_EXTENSIONS.has(ext)) return 'config';
  return 'other';
}

function getFolder(relativePath: string): string {
  const parts = relativePath.split('/');
  if (parts.length <= 1) return '(root)';
  // For monorepo patterns (apps/*, packages/*, libs/*), use 2-depth
  const top = parts[0].toLowerCase();
  if ((top === 'apps' || top === 'packages' || top === 'libs' || top === 'modules') && parts.length >= 3) {
    return `${parts[0]}/${parts[1]}`;
  }
  // Otherwise use top-level directory as project root
  return parts[0];
}

function buildDirectoryTree(basePath: string, prefix = '', depth = 0): string {
  if (depth > 3) return ''; // max depth - keep tree compact for AI context
  const lines: string[] = [];

  try {
    const entries = fs.readdirSync(basePath, { withFileTypes: true })
      .filter(e => !shouldIgnoreDir(e.name) || e.isFile())
      .filter(e => !(e.isFile() && e.name.startsWith('.')))
      .sort((a, b) => {
        // dirs first, then files
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const isLast = i === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const nextPrefix = prefix + (isLast ? '    ' : '│   ');

      if (entry.isDirectory() && !shouldIgnoreDir(entry.name)) {
        lines.push(`${prefix}${connector}${entry.name}/`);
        const subTree = buildDirectoryTree(
          path.join(basePath, entry.name),
          nextPrefix,
          depth + 1,
        );
        if (subTree) lines.push(subTree);
      } else if (entry.isFile()) {
        lines.push(`${prefix}${connector}${entry.name}`);
      }
    }
  } catch {
    // ignore
  }

  return lines.join('\n');
}

function readFileSafe(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_FILE_SIZE) return null;
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function extractPackageJsonSummary(content: string): string {
  try {
    const pkg = JSON.parse(content);
    const summary: Record<string, unknown> = {};

    if (pkg.name) summary.name = pkg.name;
    if (pkg.description) summary.description = pkg.description;
    if (pkg.scripts) summary.scripts = pkg.scripts;
    if (pkg.dependencies) summary.dependencies = Object.keys(pkg.dependencies);
    if (pkg.devDependencies) summary.devDependencies = Object.keys(pkg.devDependencies);

    return JSON.stringify(summary, null, 2);
  } catch {
    return content;
  }
}
