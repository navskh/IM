'use client';

import { forwardRef, useMemo, useRef } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorView, Decoration, keymap, ViewPlugin, WidgetType, type DecorationSet } from '@codemirror/view';
import { EditorState, StateEffect, StateField, Prec, RangeSetBuilder } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { mod, shift, enterKey, backspaceKey } from '@/lib/platform';
import { tags as t } from '@lezer/highlight';

// ─────────────────────────────────────────────────────────────
// Arrow ligatures: visually replace -> => <- etc. with unicode
// arrows. The actual document text is unchanged.
// ─────────────────────────────────────────────────────────────
// Map of arrow text → unicode, longest patterns first to prevent partial matches.
const LIGATURE_MAP: Record<string, string> = {
  '<-->': '⟷', '<=>': '⇔',
  '-->': '⟶', '<--': '⟵', '==>': '⟹', '<==': '⟸', '<->': '↔',
  '=>': '⇒', '->': '→', '<-': '←',
};
const LIGATURE_RE = new RegExp(
  Object.keys(LIGATURE_MAP)
    .sort((a, b) => b.length - a.length)
    .map(k => k.replace(/[-<>=]/g, '\\$&'))
    .join('|'),
  'g',
);

class LigatureWidget extends WidgetType {
  constructor(public readonly ch: string) { super(); }
  eq(other: LigatureWidget) { return other.ch === this.ch; }
  toDOM() {
    const span = document.createElement('span');
    span.textContent = this.ch;
    span.className = 'cm-ligature';
    span.style.color = 'hsl(var(--primary))';
    return span;
  }
  ignoreEvent() { return true; }
}

function buildLigatureDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    LIGATURE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LIGATURE_RE.exec(line.text)) !== null) {
      const ch = LIGATURE_MAP[m[0]];
      if (!ch) continue;
      const from = line.from + m.index;
      const to = from + m[0].length;
      builder.add(from, to, Decoration.replace({ widget: new LigatureWidget(ch) }));
    }
  }
  return builder.finish();
}

const ligaturePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildLigatureDecorations(view); }
    update(u: { docChanged: boolean; view: EditorView }) {
      if (u.docChanged) this.decorations = buildLigatureDecorations(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

// ─────────────────────────────────────────────────────────────
// Ghost-text state: a decoration widget after the cursor.
// ─────────────────────────────────────────────────────────────
const setGhost = StateEffect.define<{ from: number; text: string } | null>();

class GhostWidget extends WidgetType {
  constructor(public readonly text: string) { super(); }
  eq(other: GhostWidget) { return other.text === this.text; }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-ghost-text';
    span.textContent = this.text;
    span.style.opacity = '0.35';
    span.style.pointerEvents = 'none';
    return span;
  }
  ignoreEvent() { return true; }
}

const ghostField = StateField.define<{ from: number; text: string } | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setGhost)) return e.value;
    }
    // Any doc change or selection move clears ghost unless effect explicitly set it
    if (tr.docChanged || tr.selection) return null;
    return value;
  },
});

const ghostDecorations = EditorView.decorations.compute([ghostField], (state) => {
  const g = state.field(ghostField);
  if (!g) return Decoration.none;
  return Decoration.set([
    Decoration.widget({ widget: new GhostWidget(g.text), side: 1 }).range(g.from),
  ]);
});

// ─────────────────────────────────────────────────────────────
// Local autocomplete: suggest multi-word phrases sourced from the
// current doc + an optional wider corpus (sibling tasks, brainstorm).
// Phrases are segmented by punctuation; longer repeated n-grams win
// over single-word matches when they appear often.
// ─────────────────────────────────────────────────────────────
const CURRENT_DOC_WEIGHT = 3;
const MAX_PHRASE_LEN = 3;
const MAX_GHOST_CHARS = 40;
const TOKEN_MIN_LEN = 2;
const SEGMENT_SPLIT = /[.!?,;:·\n\r()[\]{}"]+/;

interface Segment { tokens: string[]; weight: number }

function tokenizeSegments(text: string): string[][] {
  const out: string[][] = [];
  for (const raw of text.split(SEGMENT_SPLIT)) {
    const tokens = raw.trim().split(/\s+/).filter(t => t.length >= TOKEN_MIN_LEN);
    if (tokens.length) out.push(tokens);
  }
  return out;
}

// Cache extra-corpus segmentation by array identity to avoid re-splitting
// a potentially large text blob on every keystroke.
let cachedExtraRef: string[] | null = null;
let cachedExtraSegs: Segment[] = [];
function getExtraSegments(extraCorpus: string[]): Segment[] {
  if (extraCorpus === cachedExtraRef) return cachedExtraSegs;
  const segs: Segment[] = [];
  for (const text of extraCorpus) {
    for (const toks of tokenizeSegments(text)) segs.push({ tokens: toks, weight: 1 });
  }
  cachedExtraRef = extraCorpus;
  cachedExtraSegs = segs;
  return segs;
}

function buildSegments(doc: string, extraCorpus: string[]): Segment[] {
  const out: Segment[] = [];
  for (const toks of tokenizeSegments(doc)) out.push({ tokens: toks, weight: CURRENT_DOC_WEIGHT });
  return out.concat(getExtraSegments(extraCorpus));
}

function caretPrefix(state: EditorState): { word: string; from: number } | null {
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const col = pos - line.from;
  const before = line.text.slice(0, col);
  const after = line.text.slice(col);
  // Don't suggest when the caret sits inside a word — would duplicate the
  // trailing part (e.g. "안녕하|세요" + ghost "세요" → "안녕하세요세요").
  if (/^[A-Za-z가-힣\w_-]/.test(after)) return null;
  const m = before.match(/([A-Za-z가-힣][\w가-힣_-]*)$/);
  if (!m) return null;
  return { word: m[1], from: pos - m[1].length };
}

// Gather vocabulary already present in the current doc. Segments from the
// extra corpus that share vocabulary with this set are considered "topically
// related" and receive a score boost — so if the user is writing about Pods,
// "Pod"-adjacent completions win over unrelated ones.
function buildContextVocabulary(doc: string): Set<string> {
  const set = new Set<string>();
  const matches = doc.toLowerCase().match(/[a-z가-힣][\w가-힣_-]{1,}/g);
  if (!matches) return set;
  for (const w of matches) {
    if (w.length >= TOKEN_MIN_LEN) set.add(w);
  }
  return set;
}

function computeLocalGhost(
  state: EditorState,
  extraCorpus: string[],
): { from: number; text: string } | null {
  const ctx = caretPrefix(state);
  if (!ctx || ctx.word.length < 2) return null;
  const doc = state.doc.toString();
  const segments = buildSegments(doc, extraCorpus);
  const prefix = ctx.word.toLowerCase();
  const contextVocab = buildContextVocabulary(doc);

  // Tally candidate completions by the full tail text that would be inserted.
  // Longer phrases get a small length bonus so "Claude Code" beats "Claude"
  // when both appear with equal frequency. Segments that share vocabulary
  // with the current doc get a relevance boost (up to 2×) so topically
  // related completions surface first.
  const scores = new Map<string, number>();
  for (const seg of segments) {
    let overlap = 0;
    for (const tk of seg.tokens) {
      if (contextVocab.has(tk.toLowerCase())) overlap++;
    }
    const relevance = 1 + Math.min(overlap * 0.25, 1.0);

    for (let i = 0; i < seg.tokens.length; i++) {
      const first = seg.tokens[i];
      if (first.length <= ctx.word.length) continue;
      if (!first.toLowerCase().startsWith(prefix)) continue;
      if (first === ctx.word) continue;

      const maxExtra = Math.min(MAX_PHRASE_LEN - 1, seg.tokens.length - i - 1);
      for (let n = 0; n <= maxExtra; n++) {
        const tail = n === 0
          ? first.slice(ctx.word.length)
          : `${first.slice(ctx.word.length)} ${seg.tokens.slice(i + 1, i + 1 + n).join(' ')}`;
        if (tail.length > MAX_GHOST_CHARS) break;
        const lengthBonus = 1 + n * 0.5;
        scores.set(tail, (scores.get(tail) ?? 0) + seg.weight * lengthBonus * relevance);
      }
    }
  }

  if (!scores.size) return null;
  // On exact tie, prefer later-inserted (longer) phrases using `>=`.
  let best: { text: string; score: number } | null = null;
  for (const [text, score] of scores) {
    if (!best || score >= best.score) best = { text, score };
  }
  if (!best) return null;
  return { from: state.selection.main.head, text: best.text };
}

function createLocalCompletionPlugin(corpusRef: { current: string[] }) {
  return ViewPlugin.fromClass(class {
    timer: ReturnType<typeof setTimeout> | null = null;
    constructor(public view: EditorView) {}
    update(u: { docChanged: boolean; selectionSet: boolean; state: EditorState; view: EditorView }) {
      if (!u.docChanged && !u.selectionSet) return;
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        const ghost = computeLocalGhost(u.view.state, corpusRef.current);
        u.view.dispatch({ effects: setGhost.of(ghost) });
      }, 120);
    }
    destroy() {
      if (this.timer) clearTimeout(this.timer);
    }
  });
}

// Accept-ghost command — bound to Tab, only when ghost exists
function acceptGhost(view: EditorView): boolean {
  const ghost = view.state.field(ghostField, false);
  if (!ghost) return false;
  view.dispatch({
    changes: { from: ghost.from, insert: ghost.text },
    selection: { anchor: ghost.from + ghost.text.length },
    effects: setGhost.of(null),
  });
  return true;
}

function dismissGhost(view: EditorView): boolean {
  const ghost = view.state.field(ghostField, false);
  if (!ghost) return false;
  view.dispatch({ effects: setGhost.of(null) });
  return true;
}

// ─────────────────────────────────────────────────────────────
// Checkbox toggle (⌘Enter): [ ] ↔ [x]
// ─────────────────────────────────────────────────────────────
function toggleCheckbox(view: EditorView): boolean {
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  const unchecked = line.text.match(/^(\s*[-*+]\s)\[ \](.*)$/);
  if (unchecked) {
    const replacement = `${unchecked[1]}[x]${unchecked[2]}`;
    view.dispatch({ changes: { from: line.from, to: line.to, insert: replacement } });
    return true;
  }
  const checked = line.text.match(/^(\s*[-*+]\s)\[[xX]\](.*)$/);
  if (checked) {
    const replacement = `${checked[1]}[ ]${checked[2]}`;
    view.dispatch({ changes: { from: line.from, to: line.to, insert: replacement } });
    return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// Table commands: add row below, delete current row
// ─────────────────────────────────────────────────────────────
function isTableLine(text: string): boolean {
  return /^\s*\|/.test(text);
}

function isSeparatorLine(text: string): boolean {
  return /^\s*\|[\s:|-]+\|\s*$/.test(text);
}

function countColumns(text: string): number {
  // Count | excluding escaped ones, minus 1 (fence)
  const parts = text.split('|').filter(p => p !== undefined);
  // first and last might be empty (leading/trailing |)
  return Math.max(parts.length - 2, 1);
}

function tableAddRow(view: EditorView): boolean {
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  if (!isTableLine(line.text)) return false;
  const cols = countColumns(line.text);
  const emptyRow = '|' + Array(cols).fill('     ').join('|') + '|';
  view.dispatch({
    changes: { from: line.to, insert: '\n' + emptyRow },
    selection: { anchor: line.to + 2 }, // cursor inside first cell
  });
  return true;
}

function tableDeleteRow(view: EditorView): boolean {
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  if (!isTableLine(line.text) || isSeparatorLine(line.text)) return false;
  // Don't delete if it's the header line (first table line or line after which is separator)
  const nextLine = line.to < view.state.doc.length ? view.state.doc.lineAt(line.to + 1) : null;
  if (nextLine && isSeparatorLine(nextLine.text)) return false; // header row
  const from = line.from > 0 ? line.from - 1 : line.from; // include preceding newline
  view.dispatch({
    changes: { from, to: line.to },
    selection: { anchor: Math.min(from, view.state.doc.length) },
  });
  return true;
}

// ─────────────────────────────────────────────────────────────
// Markdown list / checkbox continuation on Enter.
// ─────────────────────────────────────────────────────────────
function continueList(view: EditorView): boolean {
  const { state } = view;
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  // Only when caret is at end of line
  if (pos !== line.to) return false;
  const text = line.text;

  const bullet = text.match(/^(\s*)([-*+])\s(\[[ xX]\]\s)?(.*)$/);
  const ordered = text.match(/^(\s*)(\d+)\.\s(.*)$/);

  if (bullet) {
    const [, indent, mark, check, content] = bullet;
    if (!content.trim()) {
      // Empty bullet → exit list
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: indent },
        selection: { anchor: line.from + indent.length },
      });
      return true;
    }
    const prefix = check ? `${indent}${mark} [ ] ` : `${indent}${mark} `;
    view.dispatch({
      changes: { from: pos, insert: `\n${prefix}` },
      selection: { anchor: pos + 1 + prefix.length },
    });
    return true;
  }
  if (ordered) {
    const [, indent, numStr, content] = ordered;
    const num = parseInt(numStr, 10);
    if (!content.trim()) {
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: indent },
        selection: { anchor: line.from + indent.length },
      });
      return true;
    }
    const prefix = `${indent}${num + 1}. `;
    view.dispatch({
      changes: { from: pos, insert: `\n${prefix}` },
      selection: { anchor: pos + 1 + prefix.length },
    });
    return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// Slash commands — type / at line start to insert structures.
// ─────────────────────────────────────────────────────────────
const SLASH_COMMANDS: { label: string; detail: string; insert: string }[] = [
  { label: '/todo', detail: '체크리스트', insert: '- [ ] ' },
  { label: '/h1', detail: '제목 1', insert: '# ' },
  { label: '/h2', detail: '제목 2', insert: '## ' },
  { label: '/h3', detail: '제목 3', insert: '### ' },
  { label: '/bullet', detail: '불릿 리스트', insert: '- ' },
  { label: '/number', detail: '번호 리스트', insert: '1. ' },
  { label: '/quote', detail: '인용', insert: '> ' },
  { label: '/hr', detail: '구분선', insert: '---\n' },
  { label: '/code', detail: '코드 블록', insert: '```\n\n```' },
  { label: '/code ts', detail: 'TypeScript 코드', insert: '```ts\n\n```' },
  { label: '/code py', detail: 'Python 코드', insert: '```python\n\n```' },
  { label: '/code sql', detail: 'SQL 코드', insert: '```sql\n\n```' },
  { label: '/code sh', detail: 'Shell 코드', insert: '```bash\n\n```' },
  { label: '/table', detail: '3열 테이블', insert: '| 열1 | 열2 | 열3 |\n|-----|-----|-----|\n|     |     |     |' },
  { label: '/link', detail: '링크', insert: '[텍스트](url)' },
  { label: '/bold', detail: '굵게', insert: '****' },
  { label: '/details', detail: '접기/펼치기', insert: '<details>\n<summary>제목</summary>\n\n내용\n\n</details>' },
  { label: '/addrow', detail: `테이블 행 추가 (${mod()}${shift()}${enterKey()})`, insert: '' },
  { label: '/delrow', detail: `테이블 행 삭제 (${mod()}${shift()}${backspaceKey()})`, insert: '' },
];

function slashCompletion(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  // Only trigger when `/` is at line start (possibly with leading whitespace)
  const m = before.match(/^(\s*)(\/\S*)$/);
  if (!m) return null;
  const from = line.from + (m[1]?.length ?? 0);
  return {
    from,
    options: SLASH_COMMANDS.map(cmd => ({
      label: cmd.label,
      detail: cmd.detail,
      apply: (view: EditorView, _completion: unknown, from: number, to: number) => {
        // Special table commands — execute action instead of inserting text
        if (cmd.label === '/addrow') {
          view.dispatch({ changes: { from, to, insert: '' } });
          tableAddRow(view);
          return;
        }
        if (cmd.label === '/delrow') {
          view.dispatch({ changes: { from, to, insert: '' } });
          tableDeleteRow(view);
          return;
        }
        // Place cursor inside code blocks (between the fences)
        const cursorOffset = cmd.insert.includes('\n\n```') ? cmd.insert.indexOf('\n\n```') + 1 : cmd.insert.length;
        view.dispatch({
          changes: { from, to, insert: cmd.insert },
          selection: { anchor: from + cursorOffset },
        });
      },
    })),
    filter: true,
  };
}

// ─────────────────────────────────────────────────────────────
// Markdown syntax highlighting — explicit Lezer-tag mapping so list
// marks, headings and inline code stand out clearly against plain
// text. `t.processingInstruction` covers ATX heading `#`s, list
// bullets (`-` `*` `+`), ordered list `1.`, quote `>`, emphasis `*`
// and link brackets — all of which we want to visually punctuate.
// ─────────────────────────────────────────────────────────────
const mdHighlight = HighlightStyle.define([
  { tag: t.heading1, color: 'hsl(var(--foreground))', fontWeight: '800', fontSize: '1.35em' },
  { tag: t.heading2, color: 'hsl(var(--foreground))', fontWeight: '700', fontSize: '1.2em' },
  { tag: t.heading3, color: 'hsl(var(--foreground))', fontWeight: '700', fontSize: '1.08em' },
  { tag: [t.heading4, t.heading5, t.heading6], color: 'hsl(var(--foreground))', fontWeight: '700' },
  { tag: t.processingInstruction, color: 'hsl(var(--accent))', fontWeight: '700' },
  { tag: t.list, color: 'hsl(var(--foreground))' },
  { tag: t.emphasis, fontStyle: 'italic', color: 'hsl(var(--foreground))' },
  { tag: t.strong, fontWeight: '700', color: 'hsl(var(--foreground))' },
  { tag: [t.link, t.url], color: 'hsl(var(--primary))', textDecoration: 'underline' },
  { tag: t.monospace, color: 'hsl(var(--warning))' },
  { tag: t.quote, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' },
  { tag: t.contentSeparator, color: 'hsl(var(--border))' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: 'hsl(var(--muted-foreground))' },
]);

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
// Extract the current bullet/checkbox line text suitable for promoting to a task.
// Returns the "content" portion (without the `- [ ]` marker) and the line range.
export function getPromotableLine(view: EditorView): { content: string; from: number; to: number } | null {
  const state = view.state;
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const m = line.text.match(/^(\s*)([-*+])\s(?:\[[ xX]\]\s)?(.*)$/);
  if (!m) return null;
  const content = m[3]?.trim();
  if (!content) return null;
  return { content, from: line.from, to: line.to };
}

export interface NoteEditorProps {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  onOpenCommand?: () => void;
  onPromoteLine?: () => void;
  onFocusMode?: () => void;
  placeholder?: string;
  /** Extra text blobs (sibling tasks, brainstorm, …) to widen the autocomplete corpus. */
  extraCorpus?: string[];
}

const NoteEditor = forwardRef<ReactCodeMirrorRef, NoteEditorProps>(function NoteEditor(
  { value, onChange, onBlur, onOpenCommand, onPromoteLine, onFocusMode, placeholder, extraCorpus },
  ref,
) {
  // Mutable ref keeps the plugin in sync with the latest corpus without
  // rebuilding the extension list (which would re-init CodeMirror).
  const corpusRef = useRef<string[]>(extraCorpus ?? []);
  corpusRef.current = extraCorpus ?? [];

  const extensions = useMemo(() => [
    markdown({ base: markdownLanguage }),
    syntaxHighlighting(mdHighlight),
    ligaturePlugin,
    autocompletion({
      override: [slashCompletion],
      defaultKeymap: true,
      icons: false,
    }),
    ghostField,
    ghostDecorations,
    createLocalCompletionPlugin(corpusRef),
    Prec.highest(keymap.of([
      { key: 'Tab', run: acceptGhost },
      { key: 'Escape', run: (view) => {
        if (dismissGhost(view)) return true;
        // No ghost → blur editor so global shortcuts (B, N, T, F, etc.) work
        view.contentDOM.blur();
        return true;
      }},
      { key: 'Enter', run: continueList },
      { key: 'Mod-Enter', run: toggleCheckbox },
      { key: 'Mod-Shift-Enter', run: tableAddRow },
      { key: 'Mod-Shift-Backspace', run: tableDeleteRow },
      { key: 'Mod-k', run: () => { onOpenCommand?.(); return true; } },
      { key: 'Mod-Shift-t', run: () => { onPromoteLine?.(); return true; } },
      { key: 'Mod-Shift-f', run: () => { onFocusMode?.(); return true; } },
    ])),
    EditorView.lineWrapping,
    EditorView.theme({
      '&': {
        fontSize: '13px',
        backgroundColor: 'transparent',
        color: 'hsl(var(--foreground))',
        height: '100%',
      },
      '.cm-editor': { backgroundColor: 'transparent' },
      '&.cm-focused': { outline: 'none' },
      '.cm-scroller': {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        lineHeight: '1.7',
        backgroundColor: 'transparent',
      },
      '.cm-content': {
        padding: '12px 16px',
        caretColor: 'hsl(var(--primary))',
        color: 'hsl(var(--foreground))',
      },
      '.cm-gutters': { display: 'none' },
      '.cm-activeLine': { backgroundColor: 'transparent' },
      '.cm-activeLineGutter': { backgroundColor: 'transparent' },
      '.cm-line': { backgroundColor: 'transparent' },
      '.cm-selectionLayer .cm-selectionBackground, .cm-content ::selection, ::selection': {
        backgroundColor: 'hsl(var(--primary) / 0.12)',
      },
      '&.cm-focused .cm-selectionBackground': {
        backgroundColor: 'hsl(var(--primary) / 0.15)',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'hsl(var(--primary))',
        borderLeftWidth: '2px',
      },
      '.cm-ghost-text': {
        color: 'hsl(var(--muted-foreground))',
        opacity: '0.55',
        fontStyle: 'italic',
      },
      '.cm-placeholder': {
        color: 'hsl(var(--muted-foreground) / 0.55)',
        whiteSpace: 'normal',
        display: 'inline-block',
        maxWidth: '90%',
        lineHeight: '1.6',
      },
      // Markdown syntax coloring (one-dark style tuned to IM palette)
      '.tok-heading, .tok-heading1, .tok-heading2, .tok-heading3, .tok-heading4, .tok-heading5, .tok-heading6': {
        color: 'hsl(var(--foreground))',
        fontWeight: '700',
      },
      '.tok-emphasis': { fontStyle: 'italic', color: 'hsl(var(--foreground))' },
      '.tok-strong': { fontWeight: '700', color: 'hsl(var(--foreground))' },
      '.tok-link': { color: 'hsl(var(--primary))', textDecoration: 'underline' },
      '.tok-url': { color: 'hsl(var(--primary))' },
      '.tok-monospace, .tok-literal': {
        color: 'hsl(var(--warning))',
        backgroundColor: 'hsl(var(--muted) / 0.5)',
        padding: '0 3px',
        borderRadius: '3px',
      },
      '.tok-list': { color: 'hsl(var(--accent))' },
      '.tok-quote': { color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' },
      '.tok-comment, .tok-meta': { color: 'hsl(var(--muted-foreground))' },
    }),
  ], [onOpenCommand]);

  return (
    <div className="h-full w-full">
      <CodeMirror
        ref={ref}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        extensions={extensions}
        theme="none"
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          autocompletion: false,
          searchKeymap: false,
        }}
        placeholder={placeholder}
        height="100%"
        style={{ height: '100%' }}
      />
    </div>
  );
});

export default NoteEditor;
