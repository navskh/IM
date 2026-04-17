/**
 * Platform detection + shortcut formatting helpers for the client UI.
 * - macOS: ⌘, ⇧, ⌥, ⌃
 * - Windows/Linux: Ctrl, Shift, Alt
 */

export function isMac(): boolean {
  if (typeof navigator === 'undefined') return true; // SSR fallback
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const plat = nav.userAgentData?.platform || navigator.platform || navigator.userAgent || '';
  return /Mac|iPhone|iPad|iPod/i.test(plat);
}

export const mod = (): string => (isMac() ? '⌘' : 'Ctrl');
export const shift = (): string => (isMac() ? '⇧' : 'Shift');
export const alt = (): string => (isMac() ? '⌥' : 'Alt');
export const enterKey = (): string => (isMac() ? '↵' : 'Enter');
export const backspaceKey = (): string => (isMac() ? '⌫' : 'Backspace');

/**
 * Format a shortcut like "Mod-Shift-f" into ⌘⇧F or Ctrl+Shift+F
 * for display. Accepts +/- separators. Tokens: Mod, Cmd, Ctrl, Shift, Alt, Enter, Backspace, or single char.
 */
export function fmtShortcut(spec: string): string {
  const mac = isMac();
  const sep = mac ? '' : '+';
  const tokens = spec.split(/[-+]/).map(t => t.trim()).filter(Boolean);
  const parts = tokens.map((t, i) => {
    const isLast = i === tokens.length - 1;
    const lower = t.toLowerCase();
    if (lower === 'mod' || lower === 'cmd' || lower === 'ctrl') return mac ? '⌘' : 'Ctrl';
    if (lower === 'shift') return mac ? '⇧' : 'Shift';
    if (lower === 'alt' || lower === 'option') return mac ? '⌥' : 'Alt';
    if (lower === 'enter' || lower === 'return') return mac ? '↵' : 'Enter';
    if (lower === 'backspace') return mac ? '⌫' : 'Backspace';
    if (lower === 'escape' || lower === 'esc') return 'Esc';
    if (lower === 'tab') return 'Tab';
    // single character — uppercase for display on last slot
    return isLast ? t.toUpperCase() : t;
  });
  return parts.join(sep);
}
