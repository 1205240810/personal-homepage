/**
 * Keyboard ownership for the exploration canvas. Phaser's global key capture
 * used to swallow Space/arrow keys page-wide, so focused buttons could not be
 * pressed with Space and sliders could not be nudged with arrows.
 */
type KeyTarget = { closest?: (selector: string) => unknown } | null;
const FORM_FIELD =
  'input,select,textarea,[contenteditable=""],[contenteditable="true"],[role="slider"],[role="spinbutton"]';
const INTERACTIVE = `${FORM_FIELD},a[href],button,summary,[role="button"],[role="link"],[role="menuitem"],[role="tab"],[role="option"],[role="checkbox"],[role="switch"]`;
/** Keys that would scroll the page or press a control if left to the browser. */
export const WORLD_SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);
const asTarget = (target: unknown) =>
  target && typeof target === 'object' ? (target as KeyTarget) : null;
/** Typing or adjusting a control: movement keys must not walk the pilot. */
export const isFormField = (target: unknown) =>
  !!asTarget(target)?.closest?.(FORM_FIELD);
/** The page body or the game canvas has focus, so the world may claim the key. */
export const ownsKeyboard = (target: unknown) => {
  const element = asTarget(target);
  return !element?.closest || !element.closest(INTERACTIVE);
};
