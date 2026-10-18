export interface KeyCapDisplay {
  label: string;
  symbol?: string;
  isModifier: boolean;
}

type Modifier = "Control" | "Alt" | "Shift" | "Command";

export const CYRILLIC_TO_QWERTY_MAP: Record<string, string> = {
  "й": "Q", "ц": "W", "у": "E", "к": "R", "е": "T", "н": "Y", "г": "U", "ш": "I", "щ": "O", "з": "P", "х": "[", "ъ": "]",
  "ф": "A", "ы": "S", "в": "D", "а": "F", "п": "G", "р": "H", "о": "J", "л": "K", "д": "L", "ж": ";", "э": "'",
  "я": "Z", "ч": "X", "с": "C", "м": "V", "и": "B", "т": "N", "ь": "M", "б": ",", "ю": ".", "ё": "`",
  "і": "S", "ї": "]", "є": "'", "ґ": "\\",
};

const NAMED_CODES = new Map([
  ["Space", "Space"], ["Tab", "Tab"], ["Enter", "Return"], ["NumpadEnter", "Return"], ["Backspace", "Backspace"],
  ["Delete", "Delete"], ["Insert", "Insert"], ["Home", "Home"], ["End", "End"], ["PageUp", "PageUp"], ["PageDown", "PageDown"],
  ["ArrowUp", "Up"], ["ArrowDown", "Down"], ["ArrowLeft", "Left"], ["ArrowRight", "Right"],
  ["BracketLeft", "["], ["BracketRight", "]"], ["Semicolon", ";"], ["Quote", "'"], ["Backquote", "`"], ["Comma", ","],
  ["Period", "."], ["Slash", "/"], ["Backslash", "\\"], ["Minus", "-"], ["NumpadSubtract", "-"], ["Equal", "="], ["NumpadAdd", "Plus"],
]);

const PHYSICAL_CODES: [RegExp, (match: RegExpMatchArray) => string][] = [
  [/^Key([A-Z])$/, (match) => match[1]],
  [/^Digit(\d)$/, (match) => match[1]],
  [/^Numpad(\d)$/, (match) => match[1]],
  [/^F\d{1,2}$/i, (match) => match[0].toUpperCase()],
];

const NAMED_KEYS = new Map([[" ", "Space"], ["+", "Plus"], ["space", "Space"], ["plus", "Plus"]]);

const MODIFIER_ALIASES = new Map<string, Modifier>([
  ["control", "Control"], ["ctrl", "Control"], ["commandorcontrol", "Control"],
  ["alt", "Alt"], ["option", "Alt"],
  ["shift", "Shift"],
  ["command", "Command"], ["cmd", "Command"], ["meta", "Command"], ["super", "Command"],
]);

const PLAIN_KEY = /^[a-zA-Z0-9]$/;

function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

function modifierDisplay(modifier: Modifier, mac: boolean): KeyCapDisplay {
  const displays: Record<Modifier, KeyCapDisplay> = {
    Control: { label: mac ? "Control" : "Ctrl", symbol: "⌃", isModifier: true },
    Alt: { label: mac ? "Option" : "Alt", symbol: "⌥", isModifier: true },
    Shift: { label: "Shift", symbol: "⇧", isModifier: true },
    Command: { label: mac ? "Cmd" : "Win", symbol: mac ? "⌘" : "⊞", isModifier: true },
  };
  return displays[modifier];
}

const KEY_DISPLAYS = new Map<string, KeyCapDisplay>([
  ["return", { label: "Enter", symbol: "↵", isModifier: false }],
  ["enter", { label: "Enter", symbol: "↵", isModifier: false }],
  ["space", { label: "Space", symbol: "␣", isModifier: false }],
  ["plus", { label: "+", isModifier: false }],
]);

function physicalKey(code: string): string | null {
  for (const [pattern, toKey] of PHYSICAL_CODES) {
    const match = code.match(pattern);
    if (match) return toKey(match);
  }
  return NAMED_CODES.get(code) ?? null;
}

/**
 * The key an accelerator should name: by physical position first, so a Cyrillic layout still records
 * Latin keys, then by the typed character when the event carries no usable code.
 */
export function getEnglishKeyFromEvent(event: KeyboardEvent): string | null {
  const physical = physicalKey(event.code ?? "");
  if (physical) return physical;
  const typed = CYRILLIC_TO_QWERTY_MAP[event.key.toLowerCase()];
  if (typed) return typed;
  if (PLAIN_KEY.test(event.key)) return event.key.toUpperCase();
  return NAMED_KEYS.get(event.key) ?? null;
}

function mainKeyOf(part: string): string {
  const lower = part.toLowerCase();
  return CYRILLIC_TO_QWERTY_MAP[lower] ?? NAMED_KEYS.get(lower) ?? part.toUpperCase();
}

/** Canonical accelerator: modifiers in typed order without repeats, then the last non-modifier key as a Latin key. */
export function normalizeShortcutToEnglish(shortcut: string): string {
  if (typeof shortcut !== "string") return "";
  const modifiers = new Set<Modifier>();
  let mainKey = "";
  for (const part of splitShortcutParts(shortcut)) {
    const modifier = MODIFIER_ALIASES.get(part.toLowerCase());
    if (modifier) modifiers.add(modifier);
    else mainKey = mainKeyOf(part);
  }
  return [...modifiers, ...(mainKey ? [mainKey] : [])].join("+");
}

export function getKeyDisplay(part: string): KeyCapDisplay {
  const lower = part.toLowerCase();
  const modifier = MODIFIER_ALIASES.get(lower);
  if (modifier) return modifierDisplay(modifier, isMac());
  return KEY_DISPLAYS.get(lower) ?? { label: part.toUpperCase(), isModifier: false };
}

export function splitShortcutParts(shortcut: string): string[] {
  if (!shortcut) return [];
  return shortcut.split("+").map((part) => part.trim()).filter(Boolean);
}
