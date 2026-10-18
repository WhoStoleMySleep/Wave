const TEXT_ENTRY_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

const SPACE_CONSUMING_ROLES = new Set([
  "switch",
  "checkbox",
  "radio",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "tab",
  "option",
]);

const ARROW_CONSUMING_ROLES = new Set([
  "slider",
  "spinbutton",
  "listbox",
  "combobox",
  "option",
  "menu",
  "menuitem",
  "tablist",
  "tab",
]);

const ARROW_CODES = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return TEXT_ENTRY_TAGS.has(target.tagName);
}

export function hasBlockingModifier(
  event: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey">,
): boolean {
  return event.ctrlKey || event.metaKey || event.altKey;
}

export function isBlockingOverlayOpen(): boolean {
  return Boolean(
    document.querySelector("[data-dialog-container], [data-dropdown-menu]"),
  );
}

function rolesUsing(code: string): Set<string> | null {
  if (code === "Space") return SPACE_CONSUMING_ROLES;
  return ARROW_CODES.has(code) ? ARROW_CONSUMING_ROLES : null;
}

function isRangeInput(target: HTMLElement): boolean {
  return target instanceof HTMLInputElement && target.type === "range";
}

/** A select takes Space and arrows, a range input only arrows; other controls go by their ARIA role. */
export function isKeyHandledByFocusedControl(target: EventTarget | null, code: string): boolean {
  const roles = rolesUsing(code);
  if (!roles || !(target instanceof HTMLElement)) return false;
  if (target.tagName === "SELECT" || (code !== "Space" && isRangeInput(target))) return true;
  const role = target.getAttribute("role");
  return role !== null && roles.has(role);
}
